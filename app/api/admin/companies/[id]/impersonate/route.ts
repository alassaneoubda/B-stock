import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { createImpersonationToken } from '@/lib/impersonation'

// POST /api/admin/companies/:id/impersonate
// Returns a short-lived token the client exchanges via signIn('impersonate').
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const { id } = await params

    // Target the company owner (fallback: first active user)
    const rows = await sql`
      SELECT id, email, full_name, role
      FROM users
      WHERE company_id = ${id} AND is_active = true
      ORDER BY (role = 'owner') DESC, created_at ASC
      LIMIT 1
    `
    const target = rows[0] as { id: string; email: string; full_name: string } | undefined
    if (!target) {
      return NextResponse.json(
        { error: 'Aucun utilisateur actif dans cette entreprise' },
        { status: 404 }
      )
    }

    const token = createImpersonationToken(target.id, authz.adminId)

    await logAdminAction(authz.adminId, authz.adminEmail, 'impersonate', 'user', target.id, {
      companyId: id,
      targetEmail: target.email,
    })

    return NextResponse.json({
      success: true,
      token,
      target: { id: target.id, email: target.email, name: target.full_name },
    })
  } catch (e) {
    console.error('admin impersonate error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
