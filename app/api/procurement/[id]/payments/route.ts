import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { listPayables, recordSupplierPayment, SUPPLIER_PAYMENT_METHODS } from '@/lib/domain/payables'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const paymentSchema = z.object({
  amount: z.coerce.number().positive('Le montant doit être positif').max(1_000_000_000),
  method: z.enum(SUPPLIER_PAYMENT_METHODS),
  reference: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional()
    .transform((v) => v || null),
  notes: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .optional()
    .transform((v) => v || null),
  paidAt: z
    .union([z.literal(''), z.string().regex(DATE_RE, 'Date invalide (AAAA-MM-JJ)')])
    .nullable()
    .optional()
    .transform((v) => v || null),
})

// GET /api/procurement/[id]/payments — situation de la dette du bon et règlements
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('purchases.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { id } = await params
    if (!isUuid(id)) throw notFound('Commande')

    const [order] = await sql`
      SELECT id, status FROM purchase_orders WHERE id = ${id} AND company_id = ${companyId}
    `
    if (!order) throw notFound('Commande')

    const [payable] = await listPayables(sql, companyId, { purchaseOrderId: id })
    const payments = await sql`
      SELECT sp.id, sp.payment_number, sp.amount::float8 AS amount, sp.payment_method, sp.reference,
             sp.notes, sp.paid_at::text AS paid_at, sp.status, sp.cash_movement_id, sp.cancel_reason,
             sp.cancelled_at, sp.created_at,
             COALESCE(u.full_name, u.name) AS created_by_name,
             COALESCE(cu.full_name, cu.name) AS cancelled_by_name
      FROM supplier_payments sp
      LEFT JOIN users u ON u.id = sp.created_by
      LEFT JOIN users cu ON cu.id = sp.cancelled_by
      WHERE sp.purchase_order_id = ${id} AND sp.company_id = ${companyId}
      ORDER BY sp.created_at DESC, sp.id DESC
    `

    return NextResponse.json({
      success: true,
      data: { payable: payable ?? null, orderStatus: order.status, payments },
    })
  } catch (error) {
    return handleRouteError(error, 'procurement.payments.list')
  }
}

// POST /api/procurement/[id]/payments — règlement (partiel ou total) du fournisseur
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('purchases.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const { id } = await params
    if (!isUuid(id)) throw notFound('Commande')

    const data = paymentSchema.parse(await request.json())
    const result = await withTransaction((tx) =>
      recordSupplierPayment(tx, {
        companyId,
        purchaseOrderId: id,
        userId,
        amount: data.amount,
        method: data.method,
        reference: data.reference,
        notes: data.notes,
        paidAt: data.paidAt,
      })
    )

    return NextResponse.json(
      {
        success: true,
        data: { ...result.payment, remaining: result.remaining },
        warnings: result.warnings,
        message:
          result.remaining > 0
            ? `Règlement ${result.payment.payment_number} enregistré`
            : `Règlement ${result.payment.payment_number} enregistré : commande soldée`,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleRouteError(error, 'procurement.payments.create')
  }
}
