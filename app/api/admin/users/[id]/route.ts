import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'

const ROLES = ['owner', 'manager', 'cashier', 'warehouse_keeper']

// PATCH /api/admin/users/:id — Activate/deactivate or change role
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const body = await request.json()

    const [user] = await sql`SELECT id FROM users WHERE id = ${id}`
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
    }

    if (typeof body.isActive === 'boolean') {
      await sql`UPDATE users SET is_active = ${body.isActive}, updated_at = NOW() WHERE id = ${id}`
      await logAdminAction(
        authz.adminId,
        authz.adminEmail,
        body.isActive ? 'user.activate' : 'user.deactivate',
        'user',
        id
      )
    }

    if (typeof body.role === 'string') {
      if (!ROLES.includes(body.role)) {
        return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 })
      }
      await sql`UPDATE users SET role = ${body.role}, updated_at = NOW() WHERE id = ${id}`
      await logAdminAction(authz.adminId, authz.adminEmail, 'user.set_role', 'user', id, {
        role: body.role,
      })
    }

    const [updated] = await sql`
      SELECT id, email, full_name, role, is_active FROM users WHERE id = ${id}
    `
    return NextResponse.json({ success: true, data: updated })
  } catch (e) {
    console.error('admin user patch error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
