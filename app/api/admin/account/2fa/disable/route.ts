import { NextRequest, NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { z } from 'zod'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import { verifyTotp } from '@/lib/totp'

const schema = z.object({
  password: z.string().min(1, 'Mot de passe requis').max(200),
  code: z.string().trim().regex(/^\d{6}$/, 'Le code doit comporter 6 chiffres'),
})

// POST /api/admin/account/2fa/disable  { password, code }
// Exige le mot de passe ET un code valide.
export async function POST(request: NextRequest) {
  const authz = await requireAdmin()
  if (!authz.ok) return authz.response

  try {
    const limited = await rateLimit('admin-2fa-verify', authz.adminId, { limit: 10, windowSeconds: 900 })
    if (limited) return limited

    const parsed = schema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? 'Données invalides', 'VALIDATION_ERROR')
    }

    const [admin] = await sql`
      SELECT password_hash, totp_secret, totp_enabled FROM platform_admins WHERE id = ${authz.adminId}
    `
    if (!admin) throw new AppError(404, 'Compte introuvable', 'NOT_FOUND')
    if (!admin.totp_enabled || !admin.totp_secret) {
      throw new AppError(409, 'La double authentification n’est pas activée', 'TOTP_NOT_ENABLED')
    }
    const passwordOk = await compare(parsed.data.password, admin.password_hash)
    if (!passwordOk || !verifyTotp(admin.totp_secret, parsed.data.code)) {
      throw new AppError(400, 'Mot de passe ou code incorrect', 'INVALID_CREDENTIALS')
    }

    await sql`
      UPDATE platform_admins SET totp_enabled = false, totp_secret = NULL, updated_at = NOW()
      WHERE id = ${authz.adminId}
    `
    await logAdminAction(authz.adminId, authz.adminEmail, 'admin.2fa_disable', 'admin', authz.adminId)

    return NextResponse.json({ success: true, totp_enabled: false })
  } catch (e) {
    return handleRouteError(e, 'admin.account.2fa.disable')
  }
}
