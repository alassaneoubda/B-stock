import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getSubscriptionInfo } from '@/lib/subscription'
import { getPublicPlans } from '@/lib/plans'

// GET /api/subscription — Get current subscription info + available plans
export async function GET() {
    try {
        // Must remain reachable when trial/subscription expired (renewal UI)
        const authz = await requireAuth({ skipSubscriptionCheck: true })
        if (!authz.ok) return authz.response
        const { session } = authz

        const subscription = await getSubscriptionInfo(session.user.companyId)
        const plans = await getPublicPlans()

        return NextResponse.json({
            success: true,
            data: {
                subscription,
                plans,
            },
        })
    } catch (error) {
        console.error('Error fetching subscription:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
