import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { createPayment, getPlan, getPlanPrice, isGeniusPayConfigured, type PlanInterval } from '@/lib/geniuspay'

const checkoutSchema = z.object({
  planId: z.string(),
  interval: z.enum(['monthly', 'quarterly', 'semiannual', 'yearly']),
})

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
    const { planId, interval } = checkoutSchema.parse(body)

    const plan = getPlan(planId)
    if (!plan) {
      return NextResponse.json({ error: 'Plan introuvable' }, { status: 404 })
    }

    const planPrice = getPlanPrice(planId, interval as PlanInterval)
    if (!planPrice) {
      return NextResponse.json({ error: 'Tarif introuvable' }, { status: 404 })
    }

    // Pack Entreprise at 0 XOF — activate directly without payment
    if (planPrice.price === 0) {
      const { activateSubscription } = await import('@/lib/subscription')
      await activateSubscription(
        session.user.companyId,
        plan.name,
        planPrice.months
      )
      return NextResponse.json({
        success: true,
        directActivation: true,
        message: `${plan.name} activé avec succès`,
      })
    }

    if (!isGeniusPayConfigured()) {
      return NextResponse.json(
        { error: 'GeniusPay non configuré. Ajoutez GENIUSPAY_API_KEY et GENIUSPAY_API_SECRET dans .env.local' },
        { status: 503 }
      )
    }

    const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || 'http://localhost:3000'

    const result = await createPayment({
      amount: planPrice.price,
      description: `${plan.name} — ${planPrice.label}`,
      customerName: session.user.name || undefined,
      customerEmail: session.user.email || undefined,
      successUrl: `${origin}/dashboard/plans?success=true&plan=${plan.id}&interval=${planPrice.interval}&months=${planPrice.months}`,
      errorUrl: `${origin}/dashboard/plans?canceled=true`,
      metadata: {
        companyId: session.user.companyId,
        planId: plan.id,
        planName: plan.name,
        interval: planPrice.interval,
        months: String(planPrice.months),
      },
    })

    const checkoutUrl = result.data?.checkout_url || result.data?.payment_url

    if (!checkoutUrl) {
      console.error('GeniusPay: no checkout_url in response', result)
      return NextResponse.json({ error: 'Erreur lors de la création du paiement' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      url: checkoutUrl,
      reference: result.data.reference,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
    }
    console.error('GeniusPay checkout error:', error)
    return NextResponse.json({ error: 'Erreur lors de la création du paiement' }, { status: 500 })
  }
}
