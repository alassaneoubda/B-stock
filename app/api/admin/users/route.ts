import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { ensureUsersFullNameColumn } from '@/lib/ensure-users-schema'

// GET /api/admin/users — Global user list across all tenants
export async function GET(request: NextRequest) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    await ensureUsersFullNameColumn()

    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') || '').trim()
    const role = searchParams.get('role') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = 25
    const offset = (page - 1) * limit
    const like = `%${search}%`

    const rows = await sql`
      SELECT
        u.id, u.email, u.full_name, u.role, u.is_active, u.auth_provider,
        u.last_login_at, u.created_at,
        c.id AS company_id, c.name AS company_name
      FROM users u
      JOIN companies c ON u.company_id = c.id
      WHERE
        (${search} = '' OR u.email ILIKE ${like} OR COALESCE(u.full_name, '') ILIKE ${like} OR c.name ILIKE ${like})
        AND (${role} = '' OR u.role = ${role})
      ORDER BY u.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count
      FROM users u
      JOIN companies c ON u.company_id = c.id
      WHERE
        (${search} = '' OR u.email ILIKE ${like} OR COALESCE(u.full_name, '') ILIKE ${like} OR c.name ILIKE ${like})
        AND (${role} = '' OR u.role = ${role})
    `

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
    })
  } catch (e) {
    console.error('admin users list error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
