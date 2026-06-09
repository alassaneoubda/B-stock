import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'

const priceSchema = z.object({
  interval: z.enum(['monthly', 'quarterly', 'semiannual', 'yearly']),
  months: z.coerce.number().int().min(1),
  price: z.coerce.number().min(0),
  label: z.string(),
})

const planSchema = z.object({
  name: z.string().min(2),
  display_name: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  price_monthly: z.coerce.number().min(0),
  price_yearly: z.coerce.number().min(0),
  max_users: z.coerce.number().int(),
  max_depots: z.coerce.number().int(),
  max_products: z.coerce.number().int(),
  max_clients: z.coerce.number().int().optional().default(-1),
  features: z.record(z.unknown()).optional().nullable(),
  is_active: z.boolean().optional().default(true),
  is_public: z.boolean().optional().default(true),
  is_popular: z.boolean().optional().default(false),
  sort_order: z.coerce.number().int().optional().default(0),
  checkout_prices: z.array(priceSchema).optional().nullable(),
  marketing_features: z.array(z.string()).optional().nullable(),
})

// GET /api/admin/plans — all plans (incl. inactive) with subscriber counts
export async function GET() {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const plans = await sql`
      SELECT p.*,
        (SELECT COUNT(*)::int FROM companies c WHERE c.subscription_plan_name = p.name) AS subscribers
      FROM subscription_plans p
      ORDER BY p.price_monthly ASC
    `
    return NextResponse.json({ success: true, data: plans })
  } catch (e) {
    console.error('admin plans list error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}

// POST /api/admin/plans — create a plan
export async function POST(request: NextRequest) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const body = await request.json()
    const d = planSchema.parse(body)

    const existing = await sql`SELECT 1 FROM subscription_plans WHERE name = ${d.name}`
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Un plan avec ce nom existe déjà' }, { status: 409 })
    }

    const [plan] = await sql`
      INSERT INTO subscription_plans
        (name, display_name, description, price_monthly, price_yearly,
         max_users, max_depots, max_products, max_clients, features, is_active,
         is_public, is_popular, sort_order, checkout_prices, marketing_features)
      VALUES (
        ${d.name}, ${d.display_name ?? d.name}, ${d.description ?? null}, ${d.price_monthly}, ${d.price_yearly},
        ${d.max_users}, ${d.max_depots}, ${d.max_products}, ${d.max_clients},
        ${d.features ? JSON.stringify(d.features) : null}, ${d.is_active},
        ${d.is_public}, ${d.is_popular}, ${d.sort_order},
        ${d.checkout_prices ? JSON.stringify(d.checkout_prices) : null},
        ${d.marketing_features ? JSON.stringify(d.marketing_features) : null}
      )
      RETURNING *
    `
    await logAdminAction(authz.adminId, authz.adminEmail, 'plan.create', 'plan', plan.id, { name: d.name })
    return NextResponse.json({ success: true, data: plan })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Données invalides', details: e.errors }, { status: 400 })
    }
    console.error('admin plan create error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
