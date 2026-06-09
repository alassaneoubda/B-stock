import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin-auth'
import { sql } from '@/lib/db'

// GET /api/admin/reports?months=12 — aggregated platform analytics
export async function GET(request: NextRequest) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const { searchParams } = new URL(request.url)
    const months = Math.min(36, Math.max(1, parseInt(searchParams.get('months') || '12', 10)))

    const [
      revenueByMonth,
      signupsByMonth,
      planDistribution,
      revenueByPlan,
      revenueByProvider,
      summaryRows,
    ] = await Promise.all([
      sql`
        SELECT to_char(m, 'YYYY-MM') AS month,
          COALESCE(SUM(p.amount), 0)::float AS revenue,
          COUNT(p.id)::int AS transactions
        FROM generate_series(
          date_trunc('month', NOW()) - (INTERVAL '1 month' * ${months - 1}),
          date_trunc('month', NOW()),
          INTERVAL '1 month'
        ) m
        LEFT JOIN subscription_payments p
          ON date_trunc('month', p.created_at) = m
          AND p.status IN ('completed', 'manual')
        GROUP BY m ORDER BY m
      `,
      sql`
        SELECT to_char(m, 'YYYY-MM') AS month,
          COUNT(c.id)::int AS count
        FROM generate_series(
          date_trunc('month', NOW()) - (INTERVAL '1 month' * ${months - 1}),
          date_trunc('month', NOW()),
          INTERVAL '1 month'
        ) m
        LEFT JOIN companies c
          ON date_trunc('month', c.created_at) = m
        GROUP BY m ORDER BY m
      `,
      sql`
        SELECT COALESCE(NULLIF(subscription_plan_name, ''), '—') AS plan,
          COUNT(*)::int AS companies
        FROM companies
        GROUP BY 1 ORDER BY 2 DESC
      `,
      sql`
        SELECT COALESCE(NULLIF(plan_name, ''), '—') AS plan,
          COALESCE(SUM(amount), 0)::float AS revenue,
          COUNT(*)::int AS transactions
        FROM subscription_payments
        WHERE status IN ('completed', 'manual')
        GROUP BY 1 ORDER BY 2 DESC
      `,
      sql`
        SELECT provider,
          COALESCE(SUM(amount), 0)::float AS revenue,
          COUNT(*)::int AS transactions
        FROM subscription_payments
        WHERE status IN ('completed', 'manual')
        GROUP BY 1 ORDER BY 2 DESC
      `,
      sql`
        SELECT
          (SELECT COUNT(*)::int FROM companies) AS total_companies,
          (SELECT COUNT(*)::int FROM companies WHERE subscription_status = 'active') AS active_companies,
          (SELECT COUNT(*)::int FROM companies WHERE subscription_status = 'trialing') AS trialing_companies,
          (SELECT COUNT(*)::int FROM companies WHERE is_suspended = true) AS suspended_companies,
          (SELECT COUNT(*)::int FROM users) AS total_users,
          (SELECT COALESCE(SUM(amount), 0)::float FROM subscription_payments WHERE status IN ('completed','manual')) AS total_revenue,
          (SELECT COUNT(*)::int FROM subscription_payments WHERE status IN ('completed','manual')) AS paid_transactions,
          (SELECT COALESCE(SUM(amount), 0)::float FROM subscription_payments
             WHERE status IN ('completed','manual')
             AND created_at >= date_trunc('month', NOW()) - (INTERVAL '1 month' * ${months - 1})) AS period_revenue
      `,
    ])

    const summary = summaryRows[0] || {}

    return NextResponse.json({
      success: true,
      data: {
        months,
        revenueByMonth,
        signupsByMonth,
        planDistribution,
        revenueByPlan,
        revenueByProvider,
        summary,
      },
    })
  } catch (e) {
    console.error('admin reports error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
