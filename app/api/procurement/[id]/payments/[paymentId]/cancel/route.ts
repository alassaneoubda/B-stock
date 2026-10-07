import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { withTransaction } from '@/lib/db'
import { handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { cancelSupplierPayment } from '@/lib/domain/payables'

const cancelSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
})

// POST /api/procurement/[id]/payments/[paymentId]/cancel — annulation d'un règlement (contre-passation)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const authz = await requirePermission('purchases.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const { id, paymentId } = await params
    if (!isUuid(id)) throw notFound('Commande')
    if (!isUuid(paymentId)) throw notFound('Règlement')

    const data = cancelSchema.parse(await request.json().catch(() => ({})))
    const result = await withTransaction((tx) =>
      cancelSupplierPayment(tx, { companyId, purchaseOrderId: id, paymentId, userId, reason: data.reason })
    )

    return NextResponse.json({
      success: true,
      data: result.payment,
      warnings: result.warnings,
      message: `Règlement ${result.payment.payment_number} annulé`,
    })
  } catch (error) {
    return handleRouteError(error, 'procurement.payments.cancel')
  }
}
