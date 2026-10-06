import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'
import { computeSessionTotals } from '@/lib/cash-automation'
import { money } from '@/lib/domain/payments'

// GET /api/cash — Get current open session + recent sessions
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('cash.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 500)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

    // Get current open session
    const openSessions = await sql`
      SELECT cs.*, u.full_name as opened_by_name, d.name as depot_name
      FROM cash_sessions cs
      LEFT JOIN users u ON cs.opened_by = u.id
      LEFT JOIN depots d ON cs.depot_id = d.id
      WHERE cs.company_id = ${companyId} AND cs.status = 'open'
      ORDER BY cs.opened_at DESC
      LIMIT 1
    `

    // Totaux en direct de la session ouverte (mouvements validés ou sans validation)
    let currentSession = openSessions[0] || null
    if (currentSession) {
      const t = await computeSessionTotals(sql, currentSession.id)
      currentSession = {
        ...currentSession,
        total_cash_in: t.totalIn,
        total_cash_out: t.totalOut,
        total_sales: t.totalSales,
        total_expenses: t.totalExpenses,
        expected_amount: money(Number(currentSession.opening_amount) + t.totalIn - t.totalOut),
        pending_validation_count: t.pendingValidation,
      }
    }

    // Get recent sessions
    const recentSessions = await sql`
      SELECT cs.*,
        ou.full_name as opened_by_name,
        cu.full_name as closed_by_name,
        d.name as depot_name
      FROM cash_sessions cs
      LEFT JOIN users ou ON cs.opened_by = ou.id
      LEFT JOIN users cu ON cs.closed_by = cu.id
      LEFT JOIN depots d ON cs.depot_id = d.id
      WHERE cs.company_id = ${companyId}
      ORDER BY cs.opened_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    return NextResponse.json({
      success: true,
      data: {
        currentSession,
        sessions: recentSessions,
      },
    })
  } catch (error) {
    return handleRouteError(error, 'cash.get')
  }
}

const openSchema = z.object({
  opening_amount: z.coerce.number().nonnegative('Le fonds de caisse ne peut pas être négatif').optional().default(0),
  depot_id: z.string().uuid().optional().nullable().or(z.literal('')),
  notes: z.string().max(1000).optional().nullable(),
})

// POST /api/cash — Open a new cash session
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('cash.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const data = openSchema.parse(await request.json())
    const openingAmount = money(data.opening_amount)
    const depotId = data.depot_id || null

    const session = await withTransaction(async (tx) => {
      // Sérialise les ouvertures de caisse de l'entreprise : sans ce verrou,
      // deux ouvertures simultanées voient « aucune session » et en créent deux.
      await tx.sql`SELECT pg_advisory_xact_lock(hashtext(${companyId}))`
      await assertOwned(tx.sql, companyId, { depots: [depotId] })

      const existing = await tx.sql`
        SELECT id FROM cash_sessions
        WHERE company_id = ${companyId} AND status = 'open'
        FOR UPDATE
      `
      if (existing.length > 0) {
        throw new AppError(409, "Une session de caisse est déjà ouverte. Clôturez-la d'abord.", 'CASH_ALREADY_OPEN')
      }

      const [row] = await tx.sql`
        INSERT INTO cash_sessions (company_id, depot_id, opened_by, opening_amount, notes)
        VALUES (${companyId}, ${depotId}, ${userId}, ${openingAmount}, ${data.notes || null})
        RETURNING *
      `

      await tx.sql`
        INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
        VALUES (${companyId}, ${userId}, 'create', 'cash_session', ${row.id},
          ${JSON.stringify({ opening_amount: openingAmount })}::jsonb)
      `
      return row
    })

    return NextResponse.json({ success: true, data: session })
  } catch (error) {
    return handleRouteError(error, 'cash.open')
  }
}
