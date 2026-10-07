import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { getCompanyHealth } from '@/lib/admin/company-health'

/** Fenêtre « expirés récemment » : essais terminés depuis au plus ce nombre de jours. */
const EXPIRED_LOOKBACK_DAYS = 14

const querySchema = z.object({
  window: z.enum(['3', '7', '14', 'expired']).default('7'),
})

/**
 * GET /api/admin/trials?window=3|7|14|expired — Essais à convertir.
 * - 3 / 7 / 14 : essais en cours qui se terminent dans ce nombre de jours (défaut 7)
 * - expired    : essais terminés depuis 14 jours au plus, toujours non convertis
 * Les entreprises dont la suppression est programmée sont exclues.
 */
export async function GET(request: NextRequest) {
  const authz = await requireAdmin('companies.read')
  if (!authz.ok) return authz.response

  try {
    const { searchParams } = new URL(request.url)
    const { window } = querySchema.parse({ window: searchParams.get('window') ?? undefined })
    const expired = window === 'expired'
    const days = expired ? EXPIRED_LOOKBACK_DAYS : Number(window)

    const rows = await sql`
      SELECT
        c.id, c.name, c.slug, c.email AS company_email, c.phone AS company_phone,
        c.subscription_plan_name, c.trial_ends_at, c.created_at, c.is_suspended,
        CEIL(EXTRACT(EPOCH FROM (c.trial_ends_at - NOW())) / 86400)::int AS days_left,
        o.full_name AS owner_name, o.email AS owner_email, o.phone AS owner_phone
      FROM companies c
      LEFT JOIN LATERAL (
        SELECT u.full_name, u.email, u.phone FROM users u
        WHERE u.company_id = c.id
        ORDER BY (u.role = 'owner') DESC, u.created_at ASC
        LIMIT 1
      ) o ON true
      WHERE c.subscription_status = 'trialing'
        AND c.trial_ends_at IS NOT NULL
        AND c.deletion_scheduled_at IS NULL
        AND (
          (${expired}::boolean AND c.trial_ends_at < NOW() AND c.trial_ends_at >= NOW() - (${days} * INTERVAL '1 day'))
          OR (NOT ${expired}::boolean AND c.trial_ends_at >= NOW() AND c.trial_ends_at <= NOW() + (${days} * INTERVAL '1 day'))
        )
      -- À venir : la plus proche d'abord ; expirés : le plus récent d'abord
      ORDER BY CASE WHEN ${expired}::boolean THEN -EXTRACT(EPOCH FROM c.trial_ends_at)
                    ELSE EXTRACT(EPOCH FROM c.trial_ends_at) END ASC
      LIMIT 200
    `

    const health = await getCompanyHealth(rows.map((r) => r.id as string))
    const data = rows.map((r) => {
      const h = health.get(r.id)
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        planName: r.subscription_plan_name,
        trialEndsAt: r.trial_ends_at ? new Date(r.trial_ends_at).toISOString() : null,
        daysLeft: Number(r.days_left),
        isSuspended: !!r.is_suspended,
        ownerName: r.owner_name ?? null,
        email: r.owner_email ?? r.company_email ?? null,
        phone: r.owner_phone || r.company_phone || null,
        health: h
          ? {
              level: h.level,
              reasons: h.reasons,
              lastActivityAt: h.lastActivityAt,
              sales30d: h.sales30d,
              onboardingScore: h.onboarding.score,
            }
          : null,
      }
    })

    return NextResponse.json({ success: true, data, window })
  } catch (error) {
    return handleRouteError(error, 'admin.trials.list')
  }
}
