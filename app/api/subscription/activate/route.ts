import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import { findCheckout, reconcileCheckout } from '@/lib/subscription-checkout'

const schema = z.object({
  reference: z.string().min(1).max(255).optional(),
})

/**
 * POST /api/subscription/activate
 * Appelé par /dashboard/plans au retour de GeniusPay (et en sondage tant que le
 * paiement est en attente). Ne fait JAMAIS confiance aux paramètres du client :
 * il rapproche le paiement initié (subscription_checkouts) de son statut réel
 * chez GeniusPay. Le webhook signé reste le chemin nominal.
 *
 * Réponse : { status: 'pending' | 'completed' | 'failed' | 'expired' | 'none', ... }
 */
export async function POST(request: NextRequest) {
  try {
    const authz = await requireAuth({ skipSubscriptionCheck: true })
    if (!authz.ok) return authz.response

    const limited = await rateLimit('activate', authz.companyId, { limit: 30, windowSeconds: 300 })
    if (limited) return limited

    const { reference } = schema.parse(await request.json().catch(() => ({})))

    // Sans référence (GeniusPay ne l'a pas transmise) : dernier paiement initié de l'entreprise
    const checkout = reference
      ? await findCheckout(reference, authz.companyId)
      : (
          await sql`
            SELECT * FROM subscription_checkouts
            WHERE company_id = ${authz.companyId}
            ORDER BY created_at DESC LIMIT 1
          `
        )[0] ?? null

    if (!checkout) {
      return NextResponse.json({ success: true, status: 'none' })
    }

    const result = await reconcileCheckout(checkout as any)
    return NextResponse.json({
      success: true,
      status: result.status,
      planName: checkout.plan_name,
      endsAt: result.endsAt,
      message: result.message,
    })
  } catch (error) {
    return handleRouteError(error, 'subscription.activate')
  }
}
