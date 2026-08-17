import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, logAdminAction } from '@/lib/admin-auth'
import { recordSubscriptionPayment } from '@/lib/subscription'
import { sql } from '@/lib/db'
import { ensureUsersFullNameColumn } from '@/lib/ensure-users-schema'

// GET /api/admin/companies/:id — Full tenant detail (info, usage, users, plan)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    await ensureUsersFullNameColumn()

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

    const plans = await sql`
      SELECT id, name, display_name, price_monthly, max_users, max_depots, max_products
      FROM subscription_plans
      WHERE is_active = true
      ORDER BY sort_order ASC NULLS LAST, price_monthly ASC
    `

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
      const [plan] = await sql`
        SELECT id, name, price_monthly FROM subscription_plans WHERE name = ${planName} AND is_active = true
      `
      if (!plan) return NextResponse.json({ error: 'Plan inconnu' }, { status: 400 })

      const status = String(body.status || 'active')
      if (!['trialing', 'active', 'past_due', 'canceled'].includes(status)) {
        return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
      }

      // Durée : date personnalisée | mois | illimité | défaut +1 mois
      let endsAt: string | null
      let monthsRecorded = 1

      if (body.unlimited === true || body.endsAt === null) {
        endsAt = null
        monthsRecorded = 0
      } else if (body.endsAt) {
        const d = new Date(String(body.endsAt))
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: 'Date de fin invalide' }, { status: 400 })
        }
        endsAt = d.toISOString()
        const diffMs = d.getTime() - Date.now()
        monthsRecorded = Math.max(1, Math.round(diffMs / (30.44 * 24 * 60 * 60 * 1000)))
      } else if (body.months != null && body.months !== '') {
        const months = Math.max(1, parseInt(String(body.months), 10))
        if (!months || Number.isNaN(months)) {
          return NextResponse.json({ error: 'Nombre de mois invalide' }, { status: 400 })
        }
        const d = new Date()
        d.setMonth(d.getMonth() + months)
        endsAt = d.toISOString()
        monthsRecorded = months
      } else {
        const d = new Date()
        d.setMonth(d.getMonth() + 1)
        endsAt = d.toISOString()
        monthsRecorded = 1
      }

      const note = body.note ? String(body.note).slice(0, 500) : null
      const paymentMethod = body.paymentMethod
        ? String(body.paymentMethod).slice(0, 80)
        : 'manual'
      const amount =
        body.amount != null && body.amount !== ''
          ? Math.max(0, Number(body.amount))
          : 0

      if (status === 'trialing') {
        // Essai personnalisé : la date de fin porte sur trial_ends_at
        const trialEnds = endsAt ?? (() => {
          const d = new Date()
          d.setDate(d.getDate() + 30)
          return d.toISOString()
        })()
        await sql`
          UPDATE companies SET
            subscription_plan_name = ${planName},
            subscription_plan_id = ${plan.id},
            subscription_status = 'trialing',
            trial_ends_at = ${trialEnds},
            subscription_ends_at = NULL,
            updated_at = NOW()
          WHERE id = ${id}
        `
      } else {
        await sql`
          UPDATE companies SET
            subscription_plan_name = ${planName},
            subscription_plan_id = ${plan.id},
            subscription_status = ${status},
            subscription_ends_at = ${endsAt},
            updated_at = NOW()
          WHERE id = ${id}
        `
      }

      if (status === 'active' || status === 'trialing') {
        await recordSubscriptionPayment({
          companyId: id,
          planName,
          amount: Number.isFinite(amount) ? amount : 0,
          months: monthsRecorded || 1,
          status: 'manual',
          provider: 'admin',
          metadata: {
            grantedBy: authz.adminEmail,
            paymentMethod,
            note,
            endsAt,
            status,
          },
        })
      }

      await logAdminAction(authz.adminId, authz.adminEmail, 'company.set_plan', 'company', id, {
        planName,
        status,
        endsAt,
        months: monthsRecorded,
        paymentMethod,
        note,
        amount,
      })
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
