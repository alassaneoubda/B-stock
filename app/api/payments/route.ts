import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { applyClientPayment, PAYMENT_METHODS } from '@/lib/domain/payments'

function pagination(searchParams: URLSearchParams) {
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10) || 100, 1), 500)
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)
  return { limit, offset }
}

// GET /api/payments — List payments
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('payments.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const clientIdParam = searchParams.get('clientId')
    const clientId = isUuid(clientIdParam) ? clientIdParam : null
    if (clientIdParam && !clientId) {
      return NextResponse.json({ error: 'Client : identifiant invalide' }, { status: 400 })
    }
    const { limit, offset } = pagination(searchParams)

    const payments = await sql`
      SELECT p.*, c.name as client_name, so.order_number,
             u.full_name as received_by_name
      FROM payments p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN sales_orders so ON p.sales_order_id = so.id
      LEFT JOIN users u ON p.received_by = u.id
      WHERE p.company_id = ${companyId}
        AND (${clientId}::uuid IS NULL OR p.client_id = ${clientId}::uuid)
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    return NextResponse.json({ success: true, data: payments })
  } catch (error) {
    return handleRouteError(error, 'payments.list')
  }
}

const paymentSchema = z.object({
  clientId: z.string().uuid(),
  salesOrderId: z.string().uuid().optional().nullable(),
  amount: z.coerce.number().positive('Le montant doit être positif'),
  paymentMethod: z.enum(PAYMENT_METHODS),
  paymentType: z.enum(['product', 'packaging']).optional().default('product'),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
})

// POST /api/payments — Record a client payment (allocated to open credit notes)
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('payments.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const data = paymentSchema.parse(await request.json())

    const result = await withTransaction((tx) =>
      applyClientPayment(tx, {
        companyId,
        clientId: data.clientId,
        amount: data.amount,
        accountType: data.paymentType,
        method: data.paymentMethod,
        reference: data.reference || null,
        notes: data.notes || null,
        userId,
        salesOrderId: data.salesOrderId || null,
      })
    )

    return NextResponse.json(
      {
        success: true,
        data: result.payment,
        allocations: result.allocations,
        warnings: result.warnings,
        message: 'Paiement enregistré',
      },
      { status: 201 }
    )
  } catch (error) {
    return handleRouteError(error, 'payments.create')
  }
}
