import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getPlan, getPlanPrice, type PlanInterval } from '@/lib/geniuspay'
import { activateSubscription } from '@/lib/subscription'

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
 * Fallback activation after successful payment redirect.
 * In production, the webhook handles this. But for localhost dev
 * (and as a safety net), this endpoint activates the subscription
 * when the user is redirected back with success params.
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

    const plan = getPlan(planId)
    if (!plan) {
      return NextResponse.json({ error: 'Plan introuvable' }, { status: 404 })
    }

    const planPrice = getPlanPrice(planId, interval as PlanInterval)
    if (!planPrice) {
      return NextResponse.json({ error: 'Tarif introuvable' }, { status: 404 })
    }

    const fullPlanName = `${plan.name} — ${intervalLabels[interval] || interval}`

    await activateSubscription(
      session.user.companyId,
      fullPlanName,
      planPrice.months,
      reference || undefined
    )

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
