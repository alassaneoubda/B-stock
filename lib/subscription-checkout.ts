import { sql } from './db'
import { getPayment, isGeniusPayConfigured } from './geniuspay'
import { applySubscriptionPayment, recordFailedSubscriptionPayment } from './subscription'

/**
 * Rapprochement d'un paiement d'abonnement initié (subscription_checkouts) avec
 * son statut réel chez GeniusPay. Utilisé :
 *  - au retour du client sur /dashboard/plans (activation immédiate),
 *  - par le cron de rapprochement (webhook perdu, onglet fermé…),
 *  - par le webhook lui-même (source de vérité côté fournisseur).
 * Idempotent : peut être appelé autant de fois que nécessaire.
 */

export type CheckoutState = 'pending' | 'completed' | 'failed' | 'expired'

export type ReconcileResult = {
  status: CheckoutState
  applied: boolean
  endsAt: string | null
  message?: string
}

type CheckoutRow = {
  id: string
  company_id: string
  reference: string
  plan_id: string
  plan_name: string
  months: number
  amount: string
  currency: string
  status: CheckoutState
  created_at: string
}

/** Au-delà, un paiement jamais confirmé est considéré comme expiré. */
const CHECKOUT_TTL_MS = 48 * 60 * 60 * 1000

export async function reconcileCheckout(checkout: CheckoutRow): Promise<ReconcileResult> {
  if (checkout.status !== 'pending') {
    return { status: checkout.status, applied: false, endsAt: null }
  }
  if (!isGeniusPayConfigured()) {
    return { status: 'pending', applied: false, endsAt: null, message: 'GeniusPay non configuré' }
  }

  const payment = await getPayment(checkout.reference)

  await sql`
    UPDATE subscription_checkouts
    SET provider_status = ${payment.status}, check_attempts = check_attempts + 1,
        last_checked_at = NOW(), updated_at = NOW()
    WHERE id = ${checkout.id}
  `

  if (payment.status === 'completed') {
    // Le montant payé et l'entreprise doivent correspondre au paiement initié
    const expected = Number(checkout.amount)
    if (Number(payment.amount) < expected || (payment.currency && payment.currency !== checkout.currency)) {
      console.error('[checkout] montant/devise incohérents', checkout.reference, payment.amount, payment.currency)
      return { status: 'pending', applied: false, endsAt: null, message: 'Montant payé incohérent : contactez le support' }
    }
    if (payment.metadata?.companyId && payment.metadata.companyId !== checkout.company_id) {
      console.error('[checkout] entreprise incohérente', checkout.reference)
      return { status: 'pending', applied: false, endsAt: null, message: 'Paiement non associé à ce compte' }
    }

    const result = await applySubscriptionPayment({
      companyId: checkout.company_id,
      planId: checkout.plan_id,
      planName: checkout.plan_name,
      months: Number(checkout.months),
      amount: Number(payment.amount),
      currency: payment.currency || checkout.currency,
      reference: checkout.reference,
      provider: 'geniuspay',
    })
    return { status: 'completed', applied: result.applied, endsAt: result.endsAt }
  }

  if (payment.status === 'failed') {
    await recordFailedSubscriptionPayment({
      companyId: checkout.company_id,
      reference: checkout.reference,
      planName: checkout.plan_name,
      amount: Number(checkout.amount),
      months: Number(checkout.months),
    })
    return { status: 'failed', applied: false, endsAt: null }
  }

  const tooOld = Date.now() - new Date(checkout.created_at).getTime() > CHECKOUT_TTL_MS
  if (payment.status === 'expired' || tooOld) {
    await sql`
      UPDATE subscription_checkouts SET status = 'expired', updated_at = NOW()
      WHERE id = ${checkout.id} AND status = 'pending'
    `
    return { status: 'expired', applied: false, endsAt: null }
  }

  return { status: 'pending', applied: false, endsAt: null }
}

export async function findCheckout(reference: string, companyId?: string): Promise<CheckoutRow | null> {
  const rows = companyId
    ? await sql`SELECT * FROM subscription_checkouts WHERE reference = ${reference} AND company_id = ${companyId}`
    : await sql`SELECT * FROM subscription_checkouts WHERE reference = ${reference}`
  return (rows[0] as CheckoutRow | undefined) ?? null
}

/** Rapproche tous les paiements encore en attente (cron). */
export async function reconcilePendingCheckouts(limit = 50): Promise<{ checked: number; completed: number; failed: number; expired: number; errors: number }> {
  const pending = (await sql`
    SELECT * FROM subscription_checkouts
    WHERE status = 'pending' AND created_at > NOW() - INTERVAL '7 days'
    ORDER BY last_checked_at ASC NULLS FIRST
    LIMIT ${limit}
  `) as CheckoutRow[]

  const summary = { checked: 0, completed: 0, failed: 0, expired: 0, errors: 0 }
  for (const checkout of pending) {
    summary.checked++
    try {
      const r = await reconcileCheckout(checkout)
      if (r.status === 'completed') summary.completed++
      if (r.status === 'failed') summary.failed++
      if (r.status === 'expired') summary.expired++
    } catch (e) {
      summary.errors++
      console.error('[checkout] rapprochement échoué', checkout.reference, e)
    }
  }
  return summary
}
