import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'

// POST /api/admin/companies/:id/suspend — Suspend or reactivate a tenant
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const suspend = body.suspend !== false // default true
    const reason = body.reason ? String(body.reason) : null

    const [company] = await sql`SELECT id FROM companies WHERE id = ${id}`
    if (!company) {
      return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 })
    }

    if (suspend) {
      await sql`
        UPDATE companies SET
          is_suspended = true, suspended_at = NOW(), suspension_reason = ${reason}, updated_at = NOW()
        WHERE id = ${id}
      `
    } else {
      await sql`
        UPDATE companies SET
          is_suspended = false, suspended_at = NULL, suspension_reason = NULL, updated_at = NOW()
        WHERE id = ${id}
      `
    }

    await logAdminAction(
      authz.adminId,
      authz.adminEmail,
      suspend ? 'company.suspend' : 'company.reactivate',
      'company',
      id,
      { reason }
    )

    return NextResponse.json({ success: true, suspended: suspend })
  } catch (e) {
    console.error('admin suspend error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
