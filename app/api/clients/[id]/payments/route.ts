import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { applyClientPayment, getPayableDebt, money, PAYMENT_METHODS } from '@/lib/domain/payments'

const paymentSchema = z.object({
  amount: z.coerce.number().positive('Le montant doit être positif'),
  paymentMethod: z.enum(PAYMENT_METHODS),
  reference: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
})

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(amount)
}

// POST /api/clients/[id]/payments — Record a debt payment (products first, then packaging)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await requirePermission('payments.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const { id: clientId } = await params
    if (!isUuid(clientId)) throw notFound('Client')
    const data = paymentSchema.parse(await request.json())
    const amount = money(data.amount)

    const result = await withTransaction(async (tx) => {
      // Verrou du client : les montants dus lus ci-dessous ne peuvent pas
      // changer sous nos pieds (applyClientPayment reprend le même verrou).
      const [client] = await tx.sql`
        SELECT id, name FROM clients
        WHERE id = ${clientId} AND company_id = ${companyId} AND is_active = true
        FOR UPDATE
      `
      if (!client) throw notFound('Client')

      const productDebt = await getPayableDebt(tx, { companyId, clientId, accountType: 'product' })
      const packagingDebt = await getPayableDebt(tx, { companyId, clientId, accountType: 'packaging' })
      const totalDebt = money(productDebt + packagingDebt)

      if (totalDebt <= 0) {
        throw new AppError(400, "Ce client n'a aucune dette", 'NO_DEBT')
      }
      if (amount > totalDebt) {
        throw new AppError(
          409,
          `Le montant (${formatCurrency(amount)}) dépasse la dette totale (${formatCurrency(totalDebt)})`,
          'AMOUNT_EXCEEDS_DEBT'
        )
      }

      // Produits d'abord, puis emballages
      const paidForProducts = money(Math.min(productDebt, amount))
      const paidForPackaging = money(amount - paidForProducts)

      const warnings: string[] = []
      if (paidForProducts > 0) {
        const r = await applyClientPayment(tx, {
          companyId,
          clientId,
          amount: paidForProducts,
          accountType: 'product',
          method: data.paymentMethod,
          reference: data.reference || null,
          notes: data.notes || `Encaissement dette produits - ${client.name}`,
          userId,
        })
        warnings.push(...r.warnings)
      }
      if (paidForPackaging > 0) {
        const r = await applyClientPayment(tx, {
          companyId,
          clientId,
          amount: paidForPackaging,
          accountType: 'packaging',
          method: data.paymentMethod,
          reference: data.reference || null,
          notes: data.notes || `Encaissement dette emballages - ${client.name}`,
          userId,
        })
        warnings.push(...r.warnings)
      }

      const accounts = await tx.sql`
        SELECT account_type, balance FROM client_accounts WHERE client_id = ${clientId}
      `
      return {
        paidForProducts,
        paidForPackaging,
        warnings,
        newProductBalance: Number(accounts.find((a) => a.account_type === 'product')?.balance || 0),
        newPackagingBalance: Number(accounts.find((a) => a.account_type === 'packaging')?.balance || 0),
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        paidForProducts: result.paidForProducts,
        paidForPackaging: result.paidForPackaging,
        totalPaid: amount,
        newProductBalance: result.newProductBalance,
        newPackagingBalance: result.newPackagingBalance,
      },
      warnings: result.warnings,
      message: `Paiement de ${formatCurrency(amount)} enregistré (Produits: ${formatCurrency(result.paidForProducts)}, Emballages: ${formatCurrency(result.paidForPackaging)})`,
    })
  } catch (error) {
    return handleRouteError(error, 'clients.payments.create')
  }
}

// GET /api/clients/[id]/payments — Get payment history for a client
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await requirePermission('payments.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { id: clientId } = await params
    if (!isUuid(clientId)) throw notFound('Client')

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 500)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

    const payments = await sql`
      SELECT p.*, u.full_name as received_by_name,
             so.order_number
      FROM payments p
      LEFT JOIN users u ON p.received_by = u.id
      LEFT JOIN sales_orders so ON p.sales_order_id = so.id
      WHERE p.client_id = ${clientId}
        AND p.company_id = ${companyId}
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    return NextResponse.json({ success: true, data: payments })
  } catch (error) {
    return handleRouteError(error, 'clients.payments.list')
  }
}
