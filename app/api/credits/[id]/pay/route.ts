import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { withTransaction } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { applyClientPayment, PAYMENT_METHODS } from '@/lib/domain/payments'

const paySchema = z.object({
  amount: z.coerce.number().positive('Montant invalide'),
  payment_method: z.enum(PAYMENT_METHODS).optional().default('cash'),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
})

// POST /api/credits/[id]/pay — Record a payment against a credit note
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('credits.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const creditId = (await params).id
    if (!isUuid(creditId)) throw notFound('Créance')
    const data = paySchema.parse(await request.json())

    const { credit, warnings } = await withTransaction(async (tx) => {
      const [note] = await tx.sql`
        SELECT id, client_id, sales_order_id, account_type, status
        FROM credit_notes WHERE id = ${creditId} AND company_id = ${companyId}
      `
      if (!note) throw notFound('Créance')
      if (!note.client_id) throw new AppError(409, "Cette créance n'est liée à aucun client", 'NO_CLIENT')
      if (!['pending', 'partial', 'overdue'].includes(note.status)) {
        throw new AppError(409, 'Cette créance est déjà soldée ou passée en perte', 'CREDIT_CLOSED')
      }

      // Le service verrouille la créance (FOR UPDATE) et revérifie le reste dû.
      const result = await applyClientPayment(tx, {
        companyId,
        clientId: note.client_id,
        amount: data.amount,
        accountType: note.account_type === 'packaging' ? 'packaging' : 'product',
        method: data.payment_method,
        reference: data.reference || null,
        notes: data.notes || null,
        userId,
        salesOrderId: note.sales_order_id,
        creditNoteId: note.id,
      })

      const [updated] = await tx.sql`SELECT * FROM credit_notes WHERE id = ${creditId}`
      return { credit: updated, warnings: result.warnings }
    })

    return NextResponse.json({ success: true, data: credit, warnings })
  } catch (error) {
    return handleRouteError(error, 'credits.pay')
  }
}
