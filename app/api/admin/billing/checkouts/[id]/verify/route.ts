import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { handleRouteError, notFound } from '@/lib/errors'
import { sql } from '@/lib/db'
import { reconcileCheckout } from '@/lib/subscription-checkout'

type CheckoutRow = Parameters<typeof reconcileCheckout>[0]

// POST /api/admin/billing/checkouts/:id/verify — interroge GeniusPay et applique le résultat
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireAdmin('billing.write')
  if (!authz.ok) return authz.response
  try {
    const { id } = await params
    const [checkout] = (await sql`SELECT * FROM subscription_checkouts WHERE id = ${id}`) as CheckoutRow[]
    if (!checkout) throw notFound('Paiement')

    let result: Awaited<ReturnType<typeof reconcileCheckout>>
    try {
      result = await reconcileCheckout(checkout)
    } catch (err) {
      // Prestataire injoignable : le paiement reste en attente, rien n'est perdu.
      console.error('[admin] vérification GeniusPay impossible', checkout.reference, err)
      result = { status: 'pending', applied: false, endsAt: null, message: 'GeniusPay injoignable : réessayez plus tard' }
    }
    await logAdminAction(authz.adminId, authz.adminEmail, 'checkout.verify', 'checkout', id, {
      reference: checkout.reference,
      status: result.status,
      applied: result.applied,
    })
    const [updated] = await sql`
      SELECT status, provider_status, check_attempts, last_checked_at FROM subscription_checkouts WHERE id = ${id}
    `
    return NextResponse.json({ success: true, ...result, checkout: updated })
  } catch (e) {
    return handleRouteError(e, 'admin checkout verify')
  }
}
