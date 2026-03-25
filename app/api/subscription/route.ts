import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSubscriptionInfo } from '@/lib/subscription'
import { PLANS } from '@/lib/geniuspay'

// GET /api/subscription — Get current subscription info + available plans
export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const subscription = await getSubscriptionInfo(session.user.companyId)

        return NextResponse.json({
            success: true,
            data: {
                subscription,
                plans: PLANS.map((p) => ({
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    popular: p.popular || false,
                    features: p.features,
                    prices: p.prices.map((pr) => ({
                        interval: pr.interval,
                        months: pr.months,
                        price: pr.price,
                        label: pr.label,
                    })),
                })),
            },
        })
    } catch (error) {
        console.error('Error fetching subscription:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
