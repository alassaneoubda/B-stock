import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin-auth'
import { sql } from '@/lib/db'

// GET /api/admin/billing — subscription payment history + revenue summary
export async function GET(request: NextRequest) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') || '').trim()
    const status = searchParams.get('status') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = 25
    const offset = (page - 1) * limit
    const like = `%${search}%`

    const rows = await sql`
      SELECT sp.id, sp.reference, sp.plan_name, sp.amount, sp.currency, sp.months,
             sp.status, sp.provider, sp.created_at,
             c.id AS company_id, c.name AS company_name
      FROM subscription_payments sp
      LEFT JOIN companies c ON sp.company_id = c.id
      WHERE
        (${search} = '' OR c.name ILIKE ${like} OR sp.reference ILIKE ${like} OR sp.plan_name ILIKE ${like})
        AND (${status} = '' OR sp.status = ${status})
      ORDER BY sp.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count
      FROM subscription_payments sp
      LEFT JOIN companies c ON sp.company_id = c.id
      WHERE
        (${search} = '' OR c.name ILIKE ${like} OR sp.reference ILIKE ${like} OR sp.plan_name ILIKE ${like})
        AND (${status} = '' OR sp.status = ${status})
    `

    const [summary] = await sql`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0)::bigint AS revenue_total,
        COALESCE(SUM(amount) FILTER (WHERE status = 'completed' AND created_at >= date_trunc('month', NOW())), 0)::bigint AS revenue_month,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
        COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded_count
      FROM subscription_payments
    `

    return NextResponse.json({
      success: true,
      data: rows,
      summary: {
        revenueTotal: Number(summary.revenue_total),
        revenueMonth: Number(summary.revenue_month),
        completed: summary.completed_count,
        failed: summary.failed_count,
        refunded: summary.refunded_count,
      },
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
    })
  } catch (e) {
    console.error('admin billing list error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
