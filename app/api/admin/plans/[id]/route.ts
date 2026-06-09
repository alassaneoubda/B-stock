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

const patchSchema = z.object({
  display_name: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  price_monthly: z.coerce.number().min(0).optional(),
  price_yearly: z.coerce.number().min(0).optional(),
  max_users: z.coerce.number().int().optional(),
  max_depots: z.coerce.number().int().optional(),
  max_products: z.coerce.number().int().optional(),
  max_clients: z.coerce.number().int().optional(),
  features: z.record(z.unknown()).optional().nullable(),
  is_active: z.boolean().optional(),
  is_public: z.boolean().optional(),
  is_popular: z.boolean().optional(),
  sort_order: z.coerce.number().int().optional(),
  checkout_prices: z.array(priceSchema).optional().nullable(),
  marketing_features: z.array(z.string()).optional().nullable(),
})

// PATCH /api/admin/plans/:id — update plan (name is immutable to keep links stable)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const d = patchSchema.parse(await request.json())

    const [existing] = await sql`SELECT id FROM subscription_plans WHERE id = ${id}`
    if (!existing) {
      return NextResponse.json({ error: 'Plan introuvable' }, { status: 404 })
    }

    const [plan] = await sql`
      UPDATE subscription_plans SET
        display_name = COALESCE(${d.display_name ?? null}, display_name),
        description = COALESCE(${d.description ?? null}, description),
        price_monthly = COALESCE(${d.price_monthly ?? null}, price_monthly),
        price_yearly = COALESCE(${d.price_yearly ?? null}, price_yearly),
        max_users = COALESCE(${d.max_users ?? null}, max_users),
        max_depots = COALESCE(${d.max_depots ?? null}, max_depots),
        max_products = COALESCE(${d.max_products ?? null}, max_products),
        max_clients = COALESCE(${d.max_clients ?? null}, max_clients),
        features = COALESCE(${d.features ? JSON.stringify(d.features) : null}, features),
        is_active = COALESCE(${d.is_active ?? null}, is_active),
        is_public = COALESCE(${d.is_public ?? null}, is_public),
        is_popular = COALESCE(${d.is_popular ?? null}, is_popular),
        sort_order = COALESCE(${d.sort_order ?? null}, sort_order),
        checkout_prices = COALESCE(${d.checkout_prices ? JSON.stringify(d.checkout_prices) : null}::jsonb, checkout_prices),
        marketing_features = COALESCE(${d.marketing_features ? JSON.stringify(d.marketing_features) : null}::jsonb, marketing_features)
      WHERE id = ${id}
      RETURNING *
    `
    await logAdminAction(authz.adminId, authz.adminEmail, 'plan.update', 'plan', id)
    return NextResponse.json({ success: true, data: plan })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Données invalides', details: e.errors }, { status: 400 })
    }
    console.error('admin plan patch error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}

// DELETE /api/admin/plans/:id — guarded (refuse if subscribers exist)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const [plan] = await sql`SELECT name FROM subscription_plans WHERE id = ${id}`
    if (!plan) {
      return NextResponse.json({ error: 'Plan introuvable' }, { status: 404 })
    }

    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count FROM companies WHERE subscription_plan_name = ${plan.name}
    `
    if (count > 0) {
      return NextResponse.json(
        { error: `Suppression impossible : ${count} entreprise(s) utilisent ce plan. Désactivez-le plutôt.` },
        { status: 409 }
      )
    }

    await sql`DELETE FROM subscription_plans WHERE id = ${id}`
    await logAdminAction(authz.adminId, authz.adminEmail, 'plan.delete', 'plan', id, { name: plan.name })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('admin plan delete error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
