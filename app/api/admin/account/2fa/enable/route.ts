import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import { verifyTotp } from '@/lib/totp'

const schema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Le code doit comporter 6 chiffres'),
})

// POST /api/admin/account/2fa/enable  { code } — active la 2FA après vérification d'un code
export async function POST(request: NextRequest) {
  const authz = await requireAdmin()
  if (!authz.ok) return authz.response

  try {
    const limited = await rateLimit('admin-2fa-verify', authz.adminId, { limit: 10, windowSeconds: 900 })
    if (limited) return limited

    const parsed = schema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? 'Code invalide', 'VALIDATION_ERROR')
    }

    const [admin] = await sql`SELECT totp_secret, totp_enabled FROM platform_admins WHERE id = ${authz.adminId}`
    if (!admin) throw new AppError(404, 'Compte introuvable', 'NOT_FOUND')
    if (admin.totp_enabled) {
      throw new AppError(409, 'La double authentification est déjà activée', 'TOTP_ALREADY_ENABLED')
    }
    if (!admin.totp_secret) {
      throw new AppError(400, 'Commencez par générer une clé de configuration', 'TOTP_NOT_SETUP')
    }
    if (!verifyTotp(admin.totp_secret, parsed.data.code)) {
      throw new AppError(400, 'Code incorrect ou expiré. Vérifiez l’heure de votre téléphone et réessayez.', 'OTP_INVALID')
    }

    await sql`UPDATE platform_admins SET totp_enabled = true, updated_at = NOW() WHERE id = ${authz.adminId}`
    await logAdminAction(authz.adminId, authz.adminEmail, 'admin.2fa_enable', 'admin', authz.adminId)

    return NextResponse.json({ success: true, totp_enabled: true })
  } catch (e) {
    return handleRouteError(e, 'admin.account.2fa.enable')
  }
}
