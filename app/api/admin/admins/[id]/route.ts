import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { withTransaction } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'

const patchSchema = z
  .object({
    role: z.enum(['super_admin', 'support', 'finance']).optional(),
    is_active: z.boolean().optional(),
    reset_2fa: z.literal(true).optional(),
    force_logout: z.literal(true).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'Aucune modification demandée' })

// PATCH /api/admin/admins/:id — rôle, activation, réinitialisation 2FA, déconnexion forcée
// Garde-fous : pas de rétrogradation / désactivation de soi-même, jamais zéro super-admin actif.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireAdmin('admins.manage')
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    if (!isUuid(id)) throw notFound('Administrateur')

    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? 'Données invalides', 'VALIDATION_ERROR')
    }
    const body = parsed.data
    const isSelf = id === authz.adminId

    const updated = await withTransaction(async (tx) => {
      // Verrou sur les super-admins actifs : deux rétrogradations simultanées ne
      // peuvent pas laisser la plateforme sans super-admin.
      const activeSupers = await tx.sql`
        SELECT id FROM platform_admins WHERE role = 'super_admin' AND is_active = true FOR UPDATE
      `
      const [target] = await tx.sql`
        SELECT id, email, role, is_active FROM platform_admins WHERE id = ${id} FOR UPDATE
      `
      if (!target) throw notFound('Administrateur')

      const demoting = body.role !== undefined && body.role !== 'super_admin' && target.role === 'super_admin'
      const deactivating = body.is_active === false && target.is_active === true

      if (isSelf && (demoting || deactivating || (body.role !== undefined && body.role !== target.role))) {
        throw new AppError(400, 'Vous ne pouvez pas modifier votre propre rôle ni désactiver votre compte', 'SELF_PROTECTED')
      }
      if (isSelf && body.reset_2fa) {
        throw new AppError(400, 'Gérez votre propre double authentification depuis « Mon compte »', 'SELF_PROTECTED')
      }
      if (target.role === 'super_admin' && target.is_active && (demoting || deactivating)) {
        const others = activeSupers.filter((a) => a.id !== id).length
        if (others === 0) {
          throw new AppError(409, 'Impossible : il doit toujours rester au moins un super-administrateur actif', 'LAST_SUPER_ADMIN')
        }
      }

      const role = body.role ?? target.role
      const isActive = body.is_active ?? target.is_active
      // Désactivation, changement de rôle ou déconnexion forcée : les sessions existantes tombent
      const bumpSession =
        body.force_logout === true || deactivating || (body.role !== undefined && body.role !== target.role) || body.reset_2fa === true

      const [row] = await tx.sql`
        UPDATE platform_admins SET
          role = ${role},
          is_active = ${isActive},
          totp_enabled = CASE WHEN ${body.reset_2fa === true} THEN false ELSE totp_enabled END,
          totp_secret = CASE WHEN ${body.reset_2fa === true} THEN NULL ELSE totp_secret END,
          session_version = session_version + ${bumpSession ? 1 : 0},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, email, full_name, role, is_active, totp_enabled, last_login_at, created_at
      `
      return { row, previous: target }
    })

    const meta = { email: updated.previous.email }
    if (body.role !== undefined && body.role !== updated.previous.role) {
      await logAdminAction(authz.adminId, authz.adminEmail, 'admin.set_role', 'admin', id, { ...meta, from: updated.previous.role, to: body.role })
    }
    if (body.is_active !== undefined && body.is_active !== updated.previous.is_active) {
      await logAdminAction(authz.adminId, authz.adminEmail, body.is_active ? 'admin.activate' : 'admin.deactivate', 'admin', id, meta)
    }
    if (body.reset_2fa) {
      await logAdminAction(authz.adminId, authz.adminEmail, 'admin.reset_2fa', 'admin', id, meta)
    }
    if (body.force_logout) {
      await logAdminAction(authz.adminId, authz.adminEmail, 'admin.force_logout', 'admin', id, meta)
    }

    return NextResponse.json({ success: true, data: updated.row })
  } catch (e) {
    return handleRouteError(e, 'admin.admins.update')
  }
}
