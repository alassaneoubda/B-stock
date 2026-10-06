import { sql } from './db'
import { applySubscriptionPayment, fullPlanName, recordFailedSubscriptionPayment } from './subscription'

/**
 * Traite un événement GeniusPay déjà authentifié. Exportée pour le rejeu admin.
 * Renvoie 'processed' si un effet a été appliqué, 'ignored' sinon.
 */
export async function handleEvent(eventType: string, data: any): Promise<'processed' | 'ignored'> {
  const metadata = data?.metadata ?? {}
  const reference: string | null = data?.reference || null

  // Le paiement initié localement fait foi pour l'entreprise, le plan et la durée
  const [checkout] = reference
    ? await sql`SELECT * FROM subscription_checkouts WHERE reference = ${reference}`
    : []

  const companyId: string | undefined = checkout?.company_id ?? metadata.companyId
  const months = Number(checkout?.months ?? metadata.months)
  const planId: string | undefined = checkout?.plan_id ?? metadata.planId
  const planName: string | undefined =
    checkout?.plan_name ?? (metadata.planName ? fullPlanName(metadata.planName, metadata.interval) : undefined)

  if (!companyId || !planName || !Number.isInteger(months) || months <= 0) {
    console.error('[GeniusPay] Métadonnées insuffisantes', eventType, reference)
    return 'ignored'
  }

  switch (eventType) {
    case 'payment.success': {
      const amount = Number(data?.amount) || 0
      if (checkout && amount < Number(checkout.amount)) {
        throw new Error(`Montant payé (${amount}) inférieur au montant attendu (${checkout.amount})`)
      }
      const result = await applySubscriptionPayment({
        companyId,
        planId: planId ?? '',
        planName,
        months,
        amount,
        currency: data?.currency || 'XOF',
        reference,
        provider: 'geniuspay',
      })
      return result.applied ? 'processed' : 'ignored'
    }

    case 'payment.failed': {
      // On trace l'échec sans toucher à l'accès : un essai ou un abonnement
      // encore en cours ne doit pas être coupé par un paiement raté.
      await recordFailedSubscriptionPayment({
        companyId,
        reference,
        planName,
        amount: Number(data?.amount) || 0,
        currency: data?.currency || 'XOF',
        months,
      })
      return 'processed'
    }

    case 'payment.cancelled':
    case 'payment.expired': {
      if (reference) {
        await sql`
          UPDATE subscription_checkouts SET status = 'expired', provider_status = ${eventType}, updated_at = NOW()
          WHERE reference = ${reference} AND status = 'pending'
        `
      }
      return 'processed'
    }

    default:
      return 'ignored'
  }
}
