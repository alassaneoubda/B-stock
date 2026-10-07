import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { getCompanyHealth } from '@/lib/admin/company-health'

// GET /api/admin/companies — Paginated tenant list with search/filter
export async function GET(request: NextRequest) {
  const authz = await requireAdmin('companies.read')
  if (!authz.ok) return authz.response

  try {
    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') || '').trim()
    const status = searchParams.get('status') || '' // '', 'active', 'trialing', 'suspended'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = 20
    const offset = (page - 1) * limit

    const like = `%${search}%`

    const rows = await sql`
      SELECT
        c.id, c.name, c.slug, c.email, c.subscription_status,
        c.subscription_plan_name, c.trial_ends_at, c.is_suspended, c.deletion_scheduled_at,
        c.created_at,
        (SELECT COUNT(*)::int FROM users u WHERE u.company_id = c.id) AS user_count
      FROM companies c
      WHERE
        (${search} = '' OR c.name ILIKE ${like} OR c.email ILIKE ${like})
        AND (${status} = '' OR
             (${status} = 'suspended' AND c.is_suspended = true) OR
             (${status} <> 'suspended' AND c.subscription_status = ${status}))
      ORDER BY c.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count
      FROM companies c
      WHERE
        (${search} = '' OR c.name ILIKE ${like} OR c.email ILIKE ${like})
        AND (${status} = '' OR
             (${status} = 'suspended' AND c.is_suspended = true) OR
             (${status} <> 'suspended' AND c.subscription_status = ${status}))
    `

    // Santé du compte (dernière activité, ventes, démarrage) pour la page affichée
    const health = await getCompanyHealth(rows.map((r) => r.id as string))
    const data = rows.map((r) => {
      const h = health.get(r.id)
      return { ...r, health: h ? { level: h.level, lastActivityAt: h.lastActivityAt, reasons: h.reasons } : null }
    })

    return NextResponse.json({
      success: true,
      data,
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
    })
  } catch (error) {
    return handleRouteError(error, 'admin.companies.list')
  }
}
