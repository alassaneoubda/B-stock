import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwner } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { createPayment, isGeniusPayConfigured } from '@/lib/geniuspay'
import { getPlanById } from '@/lib/plans'
import { rateLimit } from '@/lib/rate-limit'
import { applySubscriptionPayment, fullPlanName } from '@/lib/subscription'

const checkoutSchema = z.object({
  planId: z.string().min(1).max(100),
  interval: z.enum(['monthly', 'quarterly', 'semiannual', 'yearly']),
})

/** URL publique de l'application (jamais déduite d'un en-tête envoyé par le client). */
function appUrl(): string {
  return (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '')
}

// POST /api/geniuspay/checkout — démarre un paiement d'abonnement
export async function POST(request: NextRequest) {
  try {
    // Le renouvellement doit rester possible abonnement expiré
    const authz = await requireOwner({ skipSubscriptionCheck: true })
    if (!authz.ok) return authz.response
    if (authz.isImpersonating) {
      throw new AppError(403, 'Paiement impossible en mode assistance', 'IMPERSONATION')
    }

    const limited = await rateLimit('checkout', authz.companyId, { limit: 10, windowSeconds: 600 })
    if (limited) return limited

    const { planId, interval } = checkoutSchema.parse(await request.json())

    const plan = await getPlanById(planId)
    if (!plan) throw notFound('Plan')

    if (plan.pricingType === 'on_quote') {
      throw new AppError(
        400,
        'Cette offre est sur devis : contactez-nous pour une proposition adaptée.',
        'ON_QUOTE'
      )
    }

    const planPrice = plan.prices.find((p) => p.interval === interval)
    if (!planPrice) throw notFound('Tarif')
    const planName = fullPlanName(plan.name, planPrice.interval)

    // Plan explicitement gratuit : activation directe (une seule fois par période)
    if (plan.pricingType === 'free') {
      if (planPrice.price !== 0) throw new AppError(400, 'Tarif incohérent pour un plan gratuit', 'PLAN_CONFIG')
      const result = await applySubscriptionPayment({
        companyId: authz.companyId,
        planId: plan.id,
        planName,
        months: planPrice.months,
        amount: 0,
        // Une référence par entreprise, plan et mois : empêche de réactiver en boucle
        reference: `free:${authz.companyId}:${plan.id}:${new Date().toISOString().slice(0, 7)}`,
        provider: 'manual',
      })
      return NextResponse.json({
        success: true,
        directActivation: true,
        alreadyActive: !result.applied,
        message: result.applied ? `${plan.name} activé avec succès` : `${plan.name} est déjà actif`,
      })
    }

    if (planPrice.price <= 0) {
      // Un plan payant à 0 est une erreur de configuration, jamais un accès gratuit
      throw new AppError(400, 'Ce tarif est momentanément indisponible', 'PLAN_CONFIG')
    }

    if (!isGeniusPayConfigured()) {
      throw new AppError(503, 'Le paiement en ligne est momentanément indisponible', 'PAYMENT_UNAVAILABLE')
    }

    const base = appUrl()
    const result = await createPayment({
      amount: planPrice.price,
      description: `${plan.name} — ${planPrice.label}`,
      customerName: authz.session.user.name || undefined,
      customerEmail: authz.session.user.email || undefined,
      // GeniusPay ajoute ?reference=... à l'URL de retour
      successUrl: `${base}/dashboard/plans?checkout=return`,
      errorUrl: `${base}/dashboard/plans?checkout=canceled`,
      metadata: {
        companyId: authz.companyId,
        planId: plan.id,
        planName: plan.name,
        interval: planPrice.interval,
        months: String(planPrice.months),
      },
    })

    const checkoutUrl = result.data?.checkout_url || result.data?.payment_url
    const reference = result.data?.reference
    if (!checkoutUrl || !reference) {
      console.error('GeniusPay: réponse incomplète', result)
      throw new AppError(502, 'Le prestataire de paiement n’a pas répondu correctement', 'PAYMENT_PROVIDER')
    }

    // Trace locale du paiement en attente : permet le rapprochement même si le
    // webhook se perd ou si le client ferme l'onglet avant le retour.
    await sql`
      INSERT INTO subscription_checkouts (
        company_id, reference, plan_id, plan_name, billing_interval, months, amount, currency, created_by
      ) VALUES (
        ${authz.companyId}, ${reference}, ${plan.id}, ${planName}, ${planPrice.interval},
        ${planPrice.months}, ${planPrice.price}, 'XOF', ${authz.userId}
      )
      ON CONFLICT (reference) DO NOTHING
    `

    return NextResponse.json({ success: true, url: checkoutUrl, reference })
  } catch (error) {
    return handleRouteError(error, 'geniuspay.checkout')
  }
}
