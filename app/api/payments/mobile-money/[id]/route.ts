import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { getPaymentRequest } from '@/lib/mobile-money/requests'

// GET /api/payments/mobile-money/[id] — statut d'une demande (lecture locale, sans appel au prestataire)
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('payments.read')
    if (!authz.ok) return authz.response
    const { id } = await params
    if (!isUuid(id)) throw notFound('Demande de paiement')
    const row = await getPaymentRequest(id, authz.companyId)
    return NextResponse.json({ success: true, data: row })
  } catch (error) {
    return handleRouteError(error, 'mobile-money.get')
  }
}
