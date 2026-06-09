import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getPayment, isGeniusPayConfigured } from '@/lib/geniuspay'
import { getPlanById, getPlanPrice, type PlanInterval } from '@/lib/plans'
import { activateSubscription, isReferenceApplied, recordSubscriptionPayment } from '@/lib/subscription'

const activateSchema = z.object({
  planId: z.string(),
  interval: z.enum(['monthly', 'quarterly', 'semiannual', 'yearly']),
  reference: z.string().optional(),
})

const intervalLabels: Record<string, string> = {
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  semiannual: 'Semestriel',
  yearly: 'Annuel',
}

/**
 * POST /api/subscription/activate
 * Activation après redirection de paiement.
 *
 * SÉCURITÉ : pour tout plan payant, le paiement est VÉRIFIÉ auprès de GeniusPay
 * (statut réel, société, plan, montant) avant activation. Cette route ne fait
 * plus confiance aux paramètres envoyés par le client. Le webhook signé reste
 * le chemin nominal ; ceci en est le filet de sécurité (et le flux localhost).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    if (session.user.role !== 'owner') {
      return NextResponse.json(
        { error: "Seul le propriétaire peut gérer l'abonnement" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { planId, interval, reference } = activateSchema.parse(body)

    const plan = await getPlanById(planId)
    if (!plan) {
      return NextResponse.json({ error: 'Plan introuvable' }, { status: 404 })
    }

    const planPrice = await getPlanPrice(planId, interval as PlanInterval)
    if (!planPrice) {
      return NextResponse.json({ error: 'Tarif introuvable' }, { status: 404 })
    }

    const fullPlanName = `${plan.name} — ${intervalLabels[interval] || interval}`

    // --- Plan gratuit (ex. Pack Entreprise 0 XOF) : pas de paiement à vérifier ---
    if (planPrice.price === 0) {
      await activateSubscription(session.user.companyId, fullPlanName, planPrice.months)
      await recordSubscriptionPayment({
        companyId: session.user.companyId,
        planName: fullPlanName,
        amount: 0,
        months: planPrice.months,
        status: 'completed',
        provider: 'manual',
      })
      return NextResponse.json({
        success: true,
        planName: fullPlanName,
        months: planPrice.months,
      })
    }

    // --- Plan payant : une référence de paiement est obligatoire ---
    if (!reference) {
      return NextResponse.json(
        { error: 'Référence de paiement manquante' },
        { status: 400 }
      )
    }

    if (!isGeniusPayConfigured()) {
      return NextResponse.json(
        { error: 'GeniusPay non configuré, impossible de vérifier le paiement' },
        { status: 503 }
      )
    }

    // Idempotence : référence déjà appliquée → ne pas ré-étendre l'abonnement
    if (await isReferenceApplied(reference)) {
      return NextResponse.json({
        success: true,
        alreadyActive: true,
        planName: fullPlanName,
      })
    }

    // Vérification réelle du paiement auprès de GeniusPay
    let payment
    try {
      payment = await getPayment(reference)
    } catch (err) {
      console.error('GeniusPay payment verification failed:', err)
      return NextResponse.json(
        { error: 'Impossible de vérifier le paiement auprès de GeniusPay' },
        { status: 502 }
      )
    }

    if (payment.status !== 'completed') {
      return NextResponse.json(
        { error: `Paiement non confirmé (statut: ${payment.status})` },
        { status: 402 }
      )
    }

    // Le paiement doit appartenir à la société de la session (anti cross-tenant)
    if (payment.metadata?.companyId && payment.metadata.companyId !== session.user.companyId) {
      return NextResponse.json(
        { error: "Ce paiement n'est pas associé à votre société" },
        { status: 403 }
      )
    }

    // Cohérence plan / intervalle si présents dans les métadonnées
    if (payment.metadata?.planId && payment.metadata.planId !== planId) {
      return NextResponse.json(
        { error: 'Incohérence entre le paiement et le plan demandé' },
        { status: 400 }
      )
    }
    if (payment.metadata?.interval && payment.metadata.interval !== interval) {
      return NextResponse.json(
        { error: 'Incohérence entre le paiement et la périodicité demandée' },
        { status: 400 }
      )
    }

    // Montant et devise
    if (Number(payment.amount) < planPrice.price) {
      return NextResponse.json(
        { error: 'Montant payé insuffisant pour ce plan' },
        { status: 400 }
      )
    }
    if (payment.currency && payment.currency !== 'XOF') {
      return NextResponse.json(
        { error: 'Devise de paiement invalide' },
        { status: 400 }
      )
    }

    // Tout est validé → activation
    await activateSubscription(
      session.user.companyId,
      fullPlanName,
      planPrice.months,
      reference
    )

    await recordSubscriptionPayment({
      companyId: session.user.companyId,
      reference,
      planName: fullPlanName,
      amount: Number(payment.amount) || planPrice.price,
      currency: payment.currency || 'XOF',
      months: planPrice.months,
      status: 'completed',
      provider: 'geniuspay',
    })

    return NextResponse.json({
      success: true,
      planName: fullPlanName,
      months: planPrice.months,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
    }
    console.error('Subscription activate error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
