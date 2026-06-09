import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin-auth'
import { sql } from '@/lib/db'

// GET /api/admin/audit — platform audit log (who did what)
export async function GET(request: NextRequest) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') || '').trim()
    const action = searchParams.get('action') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = 30
    const offset = (page - 1) * limit
    const like = `%${search}%`

    const rows = await sql`
      SELECT id, admin_email, action, target_type, target_id, metadata, created_at
      FROM platform_audit_logs
      WHERE
        (${search} = '' OR admin_email ILIKE ${like} OR action ILIKE ${like} OR target_id::text ILIKE ${like})
        AND (${action} = '' OR action = ${action})
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count
      FROM platform_audit_logs
      WHERE
        (${search} = '' OR admin_email ILIKE ${like} OR action ILIKE ${like} OR target_id::text ILIKE ${like})
        AND (${action} = '' OR action = ${action})
    `

    const actions = await sql`
      SELECT DISTINCT action FROM platform_audit_logs ORDER BY action ASC
    `

    return NextResponse.json({
      success: true,
      data: rows,
      actions: actions.map((a: any) => a.action),
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
    })
  } catch (e) {
    console.error('admin audit list error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
