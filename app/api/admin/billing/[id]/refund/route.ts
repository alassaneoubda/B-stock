import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { handleRouteError } from '@/lib/errors'
import { refundPayment } from '@/lib/billing-admin'

const schema = z.object({
  reason: z.string().trim().min(3, 'Motif requis (3 caractères minimum)').max(500),
  revokeAccess: z.boolean().optional().default(true),
})

/**
 * POST /api/admin/billing/:id/refund — rembourse un paiement complété.
 * Body : { reason, revokeAccess? = true }. Avec revokeAccess, la période payée
 * est retirée de l'abonnement (jamais avant maintenant ; annulé si échu).
 * Le reversement des fonds se fait chez le prestataire.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireAdmin('billing.write')
  if (!authz.ok) return authz.response
  try {
    const { id } = await params
    const body = schema.parse(await request.json().catch(() => ({})))
    const result = await refundPayment({ paymentId: id, reason: body.reason, revokeAccess: body.revokeAccess })
    await logAdminAction(authz.adminId, authz.adminEmail, 'payment.refund', 'payment', id, {
      reason: body.reason,
      revokeAccess: body.revokeAccess,
      companyId: result.companyId,
      subscriptionEndsAt: result.subscriptionEndsAt,
      subscriptionStatus: result.subscriptionStatus,
    })
    return NextResponse.json({ success: true, data: result })
  } catch (e) {
    return handleRouteError(e, 'admin refund')
  }
}
