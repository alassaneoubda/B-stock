import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwner } from '@/lib/api-auth'
import { withTransaction, sql } from '@/lib/db'
import { AppError, badRequest, handleRouteError } from '@/lib/errors'
import { periodLabel, periodStartOf } from '@/lib/accounting/period-lock'

/**
 * GET /api/accounting/periods — les 12 derniers mois (et tout mois clôturé plus
 * ancien) : statut de clôture et dernier export couvrant le mois.
 */
export async function GET() {
  try {
    const authz = await requireOwner()
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const rows = await sql`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE) - INTERVAL '11 months',
          date_trunc('month', CURRENT_DATE),
          INTERVAL '1 month'
        )::date AS period_start
        UNION
        SELECT period_start FROM accounting_period_locks WHERE company_id = ${companyId}
      )
      SELECT to_char(m.period_start, 'YYYY-MM') AS period,
             to_char(m.period_start, 'YYYY-MM-DD') AS period_start,
             to_char((m.period_start + INTERVAL '1 month' - INTERVAL '1 day')::date, 'YYYY-MM-DD') AS period_end,
             (m.period_start < date_trunc('month', CURRENT_DATE)) AS is_past,
             l.locked_at, COALESCE(u.full_name, u.name) AS locked_by_name,
             e.created_at AS exported_at, e.format AS export_format
      FROM months m
      LEFT JOIN accounting_period_locks l ON l.company_id = ${companyId} AND l.period_start = m.period_start
      LEFT JOIN users u ON u.id = l.locked_by
      LEFT JOIN LATERAL (
        SELECT ae.created_at, ae.format FROM accounting_exports ae
        WHERE ae.company_id = ${companyId}
          AND ae.date_from <= m.period_start
          AND ae.date_to >= (m.period_start + INTERVAL '1 month' - INTERVAL '1 day')::date
          AND array_length(ae.journals, 1) >= 6
        ORDER BY ae.created_at DESC LIMIT 1
      ) e ON true
      ORDER BY m.period_start DESC
    `
    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        period: r.period,
        periodStart: r.period_start,
        periodEnd: r.period_end,
        label: periodLabel(r.period_start),
        isPast: r.is_past,
        locked: Boolean(r.locked_at),
        lockedAt: r.locked_at,
        lockedByName: r.locked_by_name,
        exportedAt: r.exported_at,
        exportFormat: r.export_format,
      })),
    })
  } catch (error) {
    return handleRouteError(error, 'accounting.periods.get')
  }
}

const postSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Période invalide (AAAA-MM)'),
  action: z.enum(['lock', 'unlock']),
  /** Clôturer même si aucun export complet ne couvre le mois. */
  force: z.boolean().optional().default(false),
})

/**
 * POST /api/accounting/periods { period: 'AAAA-MM', action: 'lock' | 'unlock' }
 * Clôture : uniquement un mois terminé, et (sauf `force`) déjà exporté avec
 * tous les journaux. Réouverture possible, tracée dans le journal d'audit.
 */
export async function POST(request: NextRequest) {
  try {
    const authz = await requireOwner()
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz
    const data = postSchema.parse(await request.json())
    const periodStart = periodStartOf(data.period)
    if (!periodStart) throw badRequest('Période invalide')
    const label = periodLabel(periodStart)

    const message = await withTransaction(async (tx) => {
      if (data.action === 'unlock') {
        const { rowCount } = await tx.exec`
          DELETE FROM accounting_period_locks WHERE company_id = ${companyId} AND period_start = ${periodStart}::date
        `
        if (rowCount === 0) throw new AppError(409, `La période de ${label} n'est pas clôturée`, 'NOT_LOCKED')
        await tx.sql`
          INSERT INTO audit_logs (company_id, user_id, action, entity_type, details)
          VALUES (${companyId}, ${userId}, 'unlock', 'accounting_period', ${JSON.stringify({ period: data.period })}::jsonb)
        `
        return `Période de ${label} rouverte`
      }

      const [check] = await tx.sql`
        SELECT (${periodStart}::date < date_trunc('month', CURRENT_DATE)) AS is_past,
               EXISTS (
                 SELECT 1 FROM accounting_exports ae
                 WHERE ae.company_id = ${companyId}
                   AND ae.date_from <= ${periodStart}::date
                   AND ae.date_to >= (${periodStart}::date + INTERVAL '1 month' - INTERVAL '1 day')::date
                   AND array_length(ae.journals, 1) >= 6
               ) AS exported
      `
      if (!check.is_past) {
        throw new AppError(409, 'Seul un mois terminé peut être clôturé', 'PERIOD_NOT_ENDED')
      }
      if (!check.exported && !data.force) {
        throw new AppError(
          409,
          `Aucun export complet (tous les journaux) ne couvre ${label} : exportez d'abord, ou confirmez la clôture sans export.`,
          'NOT_EXPORTED'
        )
      }
      const { rowCount } = await tx.exec`
        INSERT INTO accounting_period_locks (company_id, period_start, locked_by)
        VALUES (${companyId}, ${periodStart}::date, ${userId})
        ON CONFLICT (company_id, period_start) DO NOTHING
      `
      if (rowCount === 0) throw new AppError(409, `La période de ${label} est déjà clôturée`, 'ALREADY_LOCKED')
      await tx.sql`
        INSERT INTO audit_logs (company_id, user_id, action, entity_type, details)
        VALUES (${companyId}, ${userId}, 'lock', 'accounting_period', ${JSON.stringify({ period: data.period, force: data.force })}::jsonb)
      `
      return `Période de ${label} clôturée`
    })

    return NextResponse.json({ success: true, message })
  } catch (error) {
    return handleRouteError(error, 'accounting.periods.post')
  }
}
