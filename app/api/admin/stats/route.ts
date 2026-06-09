import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin-auth'
import { sql } from '@/lib/db'

// GET /api/admin/stats — Platform-wide KPIs
export async function GET() {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const [companies] = await sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE subscription_status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE subscription_status = 'trialing')::int AS trialing,
        COUNT(*) FILTER (WHERE subscription_status = 'canceled' OR subscription_status = 'past_due')::int AS inactive,
        COUNT(*) FILTER (WHERE is_suspended = true)::int AS suspended,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_30d
      FROM companies
    `

    const [users] = await sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active = true)::int AS active,
        COUNT(*) FILTER (WHERE last_login_at >= NOW() - INTERVAL '7 days')::int AS active_7d
      FROM users
    `

    // Revenu mensuel estimé (MRR) à partir des abonnements actifs
    const [revenue] = await sql`
      SELECT COALESCE(SUM(p.price_monthly), 0)::bigint AS mrr
      FROM companies c
      JOIN subscription_plans p ON p.name = c.subscription_plan_name
      WHERE c.subscription_status = 'active'
    `

    // Inscriptions des 6 derniers mois
    const signups = await sql`
      SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
             COUNT(*)::int AS count
      FROM companies
      WHERE created_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
      GROUP BY 1
      ORDER BY 1
    `

    // Répartition par plan
    const byPlan = await sql`
      SELECT COALESCE(subscription_plan_name, 'aucun') AS plan, COUNT(*)::int AS count
      FROM companies
      GROUP BY 1
      ORDER BY 2 DESC
    `

    const mrr = Number(revenue?.mrr ?? 0)

    return NextResponse.json({
      success: true,
      data: {
        companies,
        users,
        mrr,
        arr: mrr * 12,
        signups,
        byPlan,
      },
    })
  } catch (e) {
    console.error('admin stats error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
