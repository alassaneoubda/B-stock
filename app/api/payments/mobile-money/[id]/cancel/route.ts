import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { cancelPaymentRequest, getPaymentRequest } from '@/lib/mobile-money/requests'

// POST /api/payments/mobile-money/[id]/cancel — annule localement une demande en attente
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('payments.write')
    if (!authz.ok) return authz.response
    const { id } = await params
    if (!isUuid(id)) throw notFound('Demande de paiement')
    await cancelPaymentRequest(id, authz.companyId)
    const row = await getPaymentRequest(id, authz.companyId)
    return NextResponse.json({ success: true, data: row, message: 'Demande annulée' })
  } catch (error) {
    return handleRouteError(error, 'mobile-money.cancel')
  }
}
