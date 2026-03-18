import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

const selectPlanSchema = z.object({
    planId: z.string().uuid(),
})

// GET /api/subscription — Get current subscription info with plan details
export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const companies = await sql`
            SELECT c.subscription_status, c.subscription_plan_id, c.trial_ends_at,
                   c.stripe_customer_id, c.stripe_subscription_id,
                   sp.name as plan_name, sp.price_monthly, sp.price_yearly,
                   sp.max_users, sp.max_depots, sp.max_products, sp.max_clients, sp.features
            FROM companies c
            LEFT JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
            WHERE c.id = ${session.user.companyId}
        `

        if (companies.length === 0) {
            return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 })
        }

        const plans = await sql`
            SELECT id, name, description, price_monthly, price_yearly,
                   max_users, max_depots, max_products, max_clients, features
            FROM subscription_plans
            WHERE is_active = true
            ORDER BY price_monthly ASC
        `

        // Usage stats
        const usageStats = await sql`
            SELECT
                (SELECT COUNT(*) FROM users WHERE company_id = ${session.user.companyId}) as user_count,
                (SELECT COUNT(*) FROM depots WHERE company_id = ${session.user.companyId}) as depot_count,
                (SELECT COUNT(*) FROM products WHERE company_id = ${session.user.companyId} AND is_active = true) as product_count,
                (SELECT COUNT(*) FROM clients WHERE company_id = ${session.user.companyId} AND is_active = true) as client_count
        `

        return NextResponse.json({
            success: true,
            data: {
                subscription: companies[0],
                plans,
                usage: usageStats[0],
            },
        })
    } catch (error) {
        console.error('Error fetching subscription:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

// POST /api/subscription — Select/change a plan (without Stripe for now, marks as active)
export async function POST(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        // Only owner can change subscription
        if (session.user.role !== 'owner') {
            return NextResponse.json({ error: 'Seul le propriétaire peut modifier l\'abonnement' }, { status: 403 })
        }

        const body = await request.json()
        const { planId } = selectPlanSchema.parse(body)

        // Verify plan exists
        const plans = await sql`
            SELECT id, name FROM subscription_plans WHERE id = ${planId} AND is_active = true
        `
        if (plans.length === 0) {
            return NextResponse.json({ error: 'Plan introuvable' }, { status: 404 })
        }

        // Update company subscription
        // In production, this would create a Stripe checkout session or update the subscription
        const result = await sql`
            UPDATE companies SET
                subscription_plan_id = ${planId},
                subscription_status = 'active',
                updated_at = NOW()
            WHERE id = ${session.user.companyId}
            RETURNING subscription_status, subscription_plan_id
        `

        return NextResponse.json({
            success: true,
            data: result[0],
            message: `Plan ${plans[0].name} activé avec succès`,
        })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error updating subscription:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
