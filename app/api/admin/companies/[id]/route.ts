import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, logAdminAction } from '@/lib/admin-auth'
import { recordSubscriptionPayment } from '@/lib/subscription'
import { sql } from '@/lib/db'

// GET /api/admin/companies/:id — Full tenant detail (info, usage, users, plan)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const { id } = await params

    const [company] = await sql`SELECT * FROM companies WHERE id = ${id}`
    if (!company) {
      return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 })
    }

    const users = await sql`
      SELECT id, email, full_name, role, is_active, auth_provider, last_login_at, created_at
      FROM users WHERE company_id = ${id}
      ORDER BY created_at ASC
    `

    const [usage] = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE company_id = ${id}) AS users,
        (SELECT COUNT(*)::int FROM depots WHERE company_id = ${id}) AS depots,
        (SELECT COUNT(*)::int FROM products WHERE company_id = ${id}) AS products,
        (SELECT COUNT(*)::int FROM clients WHERE company_id = ${id}) AS clients,
        (SELECT COUNT(*)::int FROM sales_orders WHERE company_id = ${id}) AS orders
    `

    const plan = company.subscription_plan_name
      ? (await sql`SELECT * FROM subscription_plans WHERE name = ${company.subscription_plan_name}`)[0] ?? null
      : null

    const plans = await sql`SELECT name, price_monthly, max_users, max_depots, max_products FROM subscription_plans WHERE is_active = true ORDER BY price_monthly ASC`

    return NextResponse.json({
      success: true,
      data: { company, users, usage, plan, plans },
    })
  } catch (e) {
    console.error('admin company detail error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}

// PATCH /api/admin/companies/:id — Manage subscription / trial / status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const body = await request.json()
    const action = body.action as string

    const [company] = await sql`SELECT id FROM companies WHERE id = ${id}`
    if (!company) {
      return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 })
    }

    if (action === 'set_plan') {
      const planName = String(body.planName || '')
      const [plan] = await sql`SELECT name FROM subscription_plans WHERE name = ${planName}`
      if (!plan) return NextResponse.json({ error: 'Plan inconnu' }, { status: 400 })

      const endsAt = new Date()
      endsAt.setMonth(endsAt.getMonth() + 1)

      await sql`
        UPDATE companies SET
          subscription_plan_name = ${planName},
          subscription_status = 'active',
          subscription_ends_at = ${endsAt.toISOString()},
          updated_at = NOW()
        WHERE id = ${id}
      `
      await recordSubscriptionPayment({
        companyId: id,
        planName,
        amount: 0,
        months: 1,
        status: 'manual',
        provider: 'admin',
        metadata: { grantedBy: authz.adminEmail },
      })
      await logAdminAction(authz.adminId, authz.adminEmail, 'company.set_plan', 'company', id, { planName })
    } else if (action === 'extend_trial') {
      const days = Math.max(1, parseInt(String(body.days || '0'), 10))
      if (!days) return NextResponse.json({ error: 'Nombre de jours invalide' }, { status: 400 })

      await sql`
        UPDATE companies SET
          trial_ends_at = GREATEST(COALESCE(trial_ends_at, NOW()), NOW()) + (${days} * INTERVAL '1 day'),
          subscription_status = 'trialing',
          updated_at = NOW()
        WHERE id = ${id}
      `
      await logAdminAction(authz.adminId, authz.adminEmail, 'company.extend_trial', 'company', id, { days })
    } else if (action === 'set_status') {
      const status = String(body.status || '')
      if (!['trialing', 'active', 'past_due', 'canceled'].includes(status)) {
        return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
      }
      await sql`UPDATE companies SET subscription_status = ${status}, updated_at = NOW() WHERE id = ${id}`
      await logAdminAction(authz.adminId, authz.adminEmail, 'company.set_status', 'company', id, { status })
    } else {
      return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
    }

    const [updated] = await sql`SELECT * FROM companies WHERE id = ${id}`
    return NextResponse.json({ success: true, data: updated })
  } catch (e) {
    console.error('admin company patch error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}

// DELETE /api/admin/companies/:id — Hard delete (guarded)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const [company] = await sql`SELECT name FROM companies WHERE id = ${id}`
    if (!company) {
      return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 })
    }

    try {
      await sql`DELETE FROM companies WHERE id = ${id}`
    } catch {
      return NextResponse.json(
        {
          error:
            "Suppression impossible : des données liées existent encore. Suspendez l'entreprise à la place.",
        },
        { status: 409 }
      )
    }

    await logAdminAction(authz.adminId, authz.adminEmail, 'company.delete', 'company', id, { name: company.name })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('admin company delete error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
