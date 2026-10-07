import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import { isUuid } from '@/lib/tenant'
import { getPaymentRequest, reconcileRequest } from '@/lib/mobile-money/requests'
import { ProviderError } from '@/lib/mobile-money/geniuspay-client'

// POST /api/payments/mobile-money/[id]/verify — « Vérifier maintenant » : relit le statut chez GeniusPay
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('payments.read')
    if (!authz.ok) return authz.response
    const { id } = await params
    if (!isUuid(id)) throw notFound('Demande de paiement')

    const limited = await rateLimit('mobile-money-verify', authz.userId, { limit: 30, windowSeconds: 60 })
    if (limited) return limited

    let outcome
    try {
      outcome = await reconcileRequest(id, { companyId: authz.companyId, source: 'manual' })
    } catch (e) {
      if (e instanceof ProviderError || (e as Error)?.name === 'TimeoutError') {
        console.error('[mobile-money] vérification impossible', id, e)
        throw new AppError(502, 'GeniusPay ne répond pas pour le moment. Réessayez dans un instant.', 'PAYMENT_PROVIDER')
      }
      throw e
    }
    const row = await getPaymentRequest(id, authz.companyId)
    return NextResponse.json({ success: true, data: row, outcome })
  } catch (error) {
    return handleRouteError(error, 'mobile-money.verify')
  }
}
