import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { badRequest, handleRouteError, notFound } from '@/lib/errors'
import { createImpersonationToken } from '@/lib/impersonation'
import { isUuid } from '@/lib/tenant'

/** Durée maximale d'une session d'assistance (alignée sur lib/auth.ts). */
const IMPERSONATION_MAX_AGE_MS = 60 * 60 * 1000

const bodySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Indiquez le motif de l’assistance (10 caractères minimum)')
    .max(500, 'Motif trop long (500 caractères maximum)'),
})

// POST /api/admin/companies/:id/impersonate  { reason }
// Renvoie un jeton court échangé côté client via signIn('impersonate').
// Le motif est tracé côté plateforme ET dans le journal de l'entreprise
// (visible par le propriétaire dans /dashboard/audit-logs).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireAdmin('companies.impersonate')
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    if (!isUuid(id)) throw notFound('Entreprise')

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      throw badRequest(parsed.error.issues[0]?.message ?? 'Motif invalide')
    }
    const { reason } = parsed.data

    // Cible : le propriétaire (à défaut, le premier utilisateur actif)
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
    const expiresAt = new Date(Date.now() + IMPERSONATION_MAX_AGE_MS).toISOString()

    await logAdminAction(authz.adminId, authz.adminEmail, 'impersonate', 'user', target.id, {
      companyId: id,
      targetEmail: target.email,
      reason,
      expiresAt,
    })

    // Transparence : l'entreprise voit l'intervention dans son journal d'audit
    await sql`
      INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
      VALUES (${id}, ${target.id}, 'impersonation_started', 'support', ${target.id},
              ${JSON.stringify({ adminEmail: authz.adminEmail, reason, expiresAt })})
    `

    return NextResponse.json({
      success: true,
      token,
      target: { id: target.id, email: target.email, name: target.full_name },
    })
  } catch (e) {
    return handleRouteError(e, 'admin.impersonate')
  }
}
