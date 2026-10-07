import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'

// GET /api/announcements — annonces actives ciblant l'utilisateur / l'entreprise courante.
// Enregistre une « vue » par utilisateur et par annonce renvoyée (statistiques du back-office).
export async function GET() {
  const authz = await requireAuth({ skipSubscriptionCheck: true })
  if (!authz.ok) return authz.response
  const { session } = authz

  try {
    const companyId = session.user.companyId
    const userId = session.user.id

    const rows = await sql`
      SELECT a.id, a.title, a.body, a.level, a.dismissible, a.created_at
      FROM announcements a
      LEFT JOIN companies c ON c.id = ${companyId}
      LEFT JOIN subscription_plans p ON p.id = a.target_plan_id
      WHERE a.is_active = true
        AND (a.starts_at IS NULL OR a.starts_at <= NOW())
        AND (a.ends_at IS NULL OR a.ends_at >= NOW())
        AND (
          a.audience = 'all'
          OR (a.audience = 'company' AND a.target_company_id = c.id)
          OR (a.audience = 'status' AND a.target_status = c.subscription_status)
          OR (a.audience = 'plan' AND a.target_plan_id IS NOT NULL AND (
                c.subscription_plan_id = a.target_plan_id
                OR (c.subscription_plan_id IS NULL AND c.subscription_plan_name = p.name)
              ))
        )
        AND NOT EXISTS (
          SELECT 1 FROM announcement_dismissals d
          WHERE d.announcement_id = a.id AND d.user_id = ${userId}
        )
      ORDER BY
        CASE a.level WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'success' THEN 2 ELSE 3 END,
        a.created_at DESC
    `

    // Une vue par utilisateur (idempotent). Pas de vue comptée pendant une « connexion en tant que » du support.
    if (rows.length > 0 && !authz.isImpersonating) {
      const ids = rows.map((r) => String(r.id))
      try {
        await sql`
          INSERT INTO announcement_views (announcement_id, user_id)
          SELECT unnest(${ids}::uuid[]), ${userId}
          ON CONFLICT (announcement_id, user_id) DO NOTHING
        `
      } catch (e) {
        console.error('[announcements] enregistrement des vues impossible', e)
      }
    }

    return NextResponse.json({ success: true, data: rows })
  } catch (e) {
    return handleRouteError(e, 'announcements GET')
  }
}
