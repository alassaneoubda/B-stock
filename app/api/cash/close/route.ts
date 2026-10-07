import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { withTransaction } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
import { computeSessionTotals } from '@/lib/cash-automation'
import { money } from '@/lib/domain/payments'

const closeSchema = z.object({
  closing_amount: z.coerce.number().nonnegative('Montant de clôture invalide').optional().default(0),
  notes: z.string().max(1000).optional().nullable(),
})

// POST /api/cash/close — Close the current cash session
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('cash.manage')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const data = closeSchema.parse(await request.json())
    const closingAmt = money(data.closing_amount)

    const { session, warnings } = await withTransaction(async (tx) => {
      // Verrou exclusif : les écritures de mouvements (FOR SHARE sur la session)
      // attendent la clôture, ou se terminent avant que les totaux soient calculés.
      const [cs] = await tx.sql`
        SELECT * FROM cash_sessions
        WHERE company_id = ${companyId} AND status = 'open'
        ORDER BY opened_at DESC LIMIT 1
        FOR UPDATE
      `
      if (!cs) throw new AppError(409, 'Aucune session de caisse ouverte', 'NO_OPEN_CASH')

      // Totaux : uniquement les mouvements sans validation requise, ou validés
      const t = await computeSessionTotals(tx.sql, cs.id)
      const expectedAmount = money(Number(cs.opening_amount) + t.totalIn - t.totalOut)
      const variance = money(closingAmt - expectedAmount)

      const { rows, rowCount } = await tx.exec`
        UPDATE cash_sessions SET
          closed_by = ${userId},
          closing_amount = ${closingAmt},
          expected_amount = ${expectedAmount},
          variance = ${variance},
          total_sales = ${t.totalSales},
          total_expenses = ${t.totalExpenses},
          total_cash_in = ${t.totalIn},
          total_cash_out = ${t.totalOut},
          status = 'closed',
          notes = COALESCE(${data.notes || null}, notes),
          closed_at = NOW()
        WHERE id = ${cs.id} AND company_id = ${companyId} AND status = 'open'
        RETURNING *
      `
      if (rowCount !== 1) {
        throw new AppError(409, 'Cette session de caisse est déjà clôturée', 'CASH_ALREADY_CLOSED')
      }

      await tx.sql`
        INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
        VALUES (${companyId}, ${userId}, 'update', 'cash_session', ${cs.id},
          ${JSON.stringify({
            closing_amount: closingAmt,
            expected: expectedAmount,
            variance,
            pending_validation: t.pendingValidation,
          })}::jsonb)
      `

      const warnings: string[] = []
      if (t.pendingValidation > 0) {
        warnings.push(
          `${t.pendingValidation} mouvement(s) en attente de validation n'ont pas été comptés dans les totaux.`
        )
      }
      return { session: rows[0], warnings }
    })

    return NextResponse.json({ success: true, data: session, warnings })
  } catch (error) {
    return handleRouteError(error, 'cash.close')
  }
}
