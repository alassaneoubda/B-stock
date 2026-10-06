import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'

/**
 * Préférences de notification de l'utilisateur connecté (table notification_settings).
 *
 * GET : préférences enregistrées, ou valeurs par défaut si aucune ligne.
 * PUT : enregistrement (upsert). La table n'a pas de contrainte d'unicité sur
 * user_id : on verrouille la ligne de l'utilisateur pour sérialiser les
 * enregistrements concurrents, puis on met à jour la ligne existante ou on en
 * insère une.
 *
 * email_enabled / sms_enabled ne sont pas modifiables tant que l'envoi
 * d'emails et de SMS n'existe pas.
 */

const DEFAULTS = {
  low_stock_enabled: true,
  low_stock_threshold: 10,
  credit_overdue_enabled: true,
  credit_overdue_days: 7,
  delivery_updates_enabled: true,
  daily_report_enabled: true,
  email_enabled: true,
  sms_enabled: false,
}

const updateSchema = z
  .object({
    low_stock_enabled: z.boolean(),
    low_stock_threshold: z.number().int().min(0).max(100_000),
    credit_overdue_enabled: z.boolean(),
    credit_overdue_days: z.number().int().min(1).max(365),
    delivery_updates_enabled: z.boolean(),
    daily_report_enabled: z.boolean(),
  })
  .partial()
  .strict()

type SettingsRow = typeof DEFAULTS & { updated_at?: string | null }

function toResponse(row: Partial<SettingsRow> | undefined) {
  return {
    low_stock_enabled: row?.low_stock_enabled ?? DEFAULTS.low_stock_enabled,
    low_stock_threshold: Number(row?.low_stock_threshold ?? DEFAULTS.low_stock_threshold),
    credit_overdue_enabled: row?.credit_overdue_enabled ?? DEFAULTS.credit_overdue_enabled,
    credit_overdue_days: Number(row?.credit_overdue_days ?? DEFAULTS.credit_overdue_days),
    delivery_updates_enabled: row?.delivery_updates_enabled ?? DEFAULTS.delivery_updates_enabled,
    daily_report_enabled: row?.daily_report_enabled ?? DEFAULTS.daily_report_enabled,
    email_enabled: row?.email_enabled ?? DEFAULTS.email_enabled,
    sms_enabled: row?.sms_enabled ?? DEFAULTS.sms_enabled,
    updated_at: row?.updated_at ?? null,
  }
}

// GET /api/profile/notifications
export async function GET() {
  try {
    const authz = await requireAuth({ skipSubscriptionCheck: true })
    if (!authz.ok) return authz.response

    const rows = await sql`
      SELECT low_stock_enabled, low_stock_threshold, credit_overdue_enabled, credit_overdue_days,
             delivery_updates_enabled, daily_report_enabled, email_enabled, sms_enabled, updated_at
      FROM notification_settings
      WHERE user_id = ${authz.userId} AND company_id = ${authz.companyId}
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
    `

    return NextResponse.json({ success: true, data: toResponse(rows[0] as Partial<SettingsRow> | undefined) })
  } catch (error) {
    return handleRouteError(error, 'profile.notifications.get')
  }
}

// PUT /api/profile/notifications
export async function PUT(request: NextRequest) {
  try {
    const authz = await requireAuth({ skipSubscriptionCheck: true })
    if (!authz.ok) return authz.response
    const { userId, companyId } = authz

    const input = updateSchema.parse(await request.json())

    const saved = await withTransaction(async (tx) => {
      // Verrou sur l'utilisateur : deux enregistrements simultanés ne peuvent
      // pas insérer chacun une ligne (pas de contrainte unique sur user_id).
      await tx.sql`SELECT id FROM users WHERE id = ${userId} AND company_id = ${companyId} FOR UPDATE`

      const [existing] = await tx.sql<Partial<SettingsRow> & { id: string }>`
        SELECT id, low_stock_enabled, low_stock_threshold, credit_overdue_enabled, credit_overdue_days,
               delivery_updates_enabled, daily_report_enabled, email_enabled, sms_enabled
        FROM notification_settings
        WHERE user_id = ${userId} AND company_id = ${companyId}
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1
        FOR UPDATE
      `

      const next = { ...toResponse(existing), ...input }

      if (existing) {
        const [row] = await tx.sql<SettingsRow>`
          UPDATE notification_settings SET
            low_stock_enabled = ${next.low_stock_enabled},
            low_stock_threshold = ${next.low_stock_threshold},
            credit_overdue_enabled = ${next.credit_overdue_enabled},
            credit_overdue_days = ${next.credit_overdue_days},
            delivery_updates_enabled = ${next.delivery_updates_enabled},
            daily_report_enabled = ${next.daily_report_enabled},
            updated_at = NOW()
          WHERE id = ${existing.id}
          RETURNING low_stock_enabled, low_stock_threshold, credit_overdue_enabled, credit_overdue_days,
                    delivery_updates_enabled, daily_report_enabled, email_enabled, sms_enabled, updated_at
        `
        return row
      }

      const [row] = await tx.sql<SettingsRow>`
        INSERT INTO notification_settings (
          company_id, user_id, low_stock_enabled, low_stock_threshold, credit_overdue_enabled,
          credit_overdue_days, delivery_updates_enabled, daily_report_enabled, email_enabled, sms_enabled
        ) VALUES (
          ${companyId}, ${userId}, ${next.low_stock_enabled}, ${next.low_stock_threshold},
          ${next.credit_overdue_enabled}, ${next.credit_overdue_days}, ${next.delivery_updates_enabled},
          ${next.daily_report_enabled}, ${DEFAULTS.email_enabled}, ${DEFAULTS.sms_enabled}
        )
        RETURNING low_stock_enabled, low_stock_threshold, credit_overdue_enabled, credit_overdue_days,
                  delivery_updates_enabled, daily_report_enabled, email_enabled, sms_enabled, updated_at
      `
      return row
    })

    return NextResponse.json({ success: true, data: toResponse(saved) })
  } catch (error) {
    return handleRouteError(error, 'profile.notifications.put')
  }
}
