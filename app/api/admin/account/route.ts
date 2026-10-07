import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'

// GET /api/admin/account — profil de l'administrateur connecté
export async function GET() {
  const authz = await requireAdmin()
  if (!authz.ok) return authz.response

  try {
    const [admin] = await sql`
      SELECT email, full_name, role, totp_enabled, last_login_at, created_at
      FROM platform_admins WHERE id = ${authz.adminId}
    `
    if (!admin) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
    return NextResponse.json({
      success: true,
      data: {
        email: admin.email,
        full_name: admin.full_name,
        role: admin.role,
        totp_enabled: admin.totp_enabled === true,
        last_login_at: admin.last_login_at,
        created_at: admin.created_at,
      },
    })
  } catch (e) {
    return handleRouteError(e, 'admin.account')
  }
}
