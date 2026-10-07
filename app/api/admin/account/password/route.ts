import { NextRequest, NextResponse } from 'next/server'
import { compare, hash } from 'bcryptjs'
import { z } from 'zod'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
import { passwordPolicyError } from '@/lib/permissions'
import { rateLimit } from '@/lib/rate-limit'

const schema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis').max(200),
  newPassword: z.string().min(1, 'Nouveau mot de passe requis').max(200),
})

// POST /api/admin/account/password — change son propre mot de passe.
// Toutes les sessions (y compris celle-ci) sont fermées : reconnexion obligatoire.
export async function POST(request: NextRequest) {
  const authz = await requireAdmin()
  if (!authz.ok) return authz.response

  try {
    const limited = await rateLimit('admin-account-password', authz.adminId, { limit: 5, windowSeconds: 900 })
    if (limited) return limited

    const parsed = schema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? 'Données invalides', 'VALIDATION_ERROR')
    }
    const { currentPassword, newPassword } = parsed.data

    const policy = passwordPolicyError(newPassword)
    if (policy) throw new AppError(400, policy, 'WEAK_PASSWORD')
    if (newPassword === currentPassword) {
      throw new AppError(400, 'Le nouveau mot de passe doit être différent de l’actuel', 'SAME_PASSWORD')
    }

    const [admin] = await sql`SELECT password_hash FROM platform_admins WHERE id = ${authz.adminId}`
    if (!admin || !(await compare(currentPassword, admin.password_hash))) {
      throw new AppError(400, 'Mot de passe actuel incorrect', 'INVALID_PASSWORD')
    }

    const passwordHash = await hash(newPassword, 12)
    await sql`
      UPDATE platform_admins
      SET password_hash = ${passwordHash}, session_version = session_version + 1, updated_at = NOW()
      WHERE id = ${authz.adminId}
    `
    await logAdminAction(authz.adminId, authz.adminEmail, 'admin.change_password', 'admin', authz.adminId)

    return NextResponse.json({ success: true, reloginRequired: true })
  } catch (e) {
    return handleRouteError(e, 'admin.account.password')
  }
}
