import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { randomBytes } from 'crypto'
import { requireSuperAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'

// POST /api/admin/users/:id/reset-password
// Generates a temporary password, stores its hash, returns the clear value once.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const [user] = await sql`SELECT id, email FROM users WHERE id = ${id}`
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
    }

    const tempPassword =
      typeof body.password === 'string' && body.password.length >= 8
        ? body.password
        : randomBytes(6).toString('base64url') + 'A1!'

    const passwordHash = await hash(tempPassword, 10)

    await sql`
      UPDATE users
      SET password_hash = ${passwordHash}, auth_provider = 'credentials', updated_at = NOW()
      WHERE id = ${id}
    `

    await logAdminAction(authz.adminId, authz.adminEmail, 'user.reset_password', 'user', id)

    return NextResponse.json({
      success: true,
      tempPassword,
      email: user.email,
    })
  } catch (e) {
    console.error('admin reset password error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
