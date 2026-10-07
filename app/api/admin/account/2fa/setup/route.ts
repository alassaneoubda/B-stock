import { NextResponse } from 'next/server'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import { formatTotpSecret, generateTotpSecret, totpUri } from '@/lib/totp'

// POST /api/admin/account/2fa/setup
// Génère un nouveau secret : stocké, mais la 2FA reste inactive tant qu'un code n'a pas été vérifié.
export async function POST() {
  const authz = await requireAdmin()
  if (!authz.ok) return authz.response

  try {
    const limited = await rateLimit('admin-2fa-setup', authz.adminId, { limit: 10, windowSeconds: 900 })
    if (limited) return limited

    const [admin] = await sql`SELECT email, totp_enabled FROM platform_admins WHERE id = ${authz.adminId}`
    if (!admin) throw new AppError(404, 'Compte introuvable', 'NOT_FOUND')
    if (admin.totp_enabled) {
      throw new AppError(409, 'La double authentification est déjà activée', 'TOTP_ALREADY_ENABLED')
    }

    const secret = generateTotpSecret()
    await sql`
      UPDATE platform_admins SET totp_secret = ${secret}, totp_enabled = false, updated_at = NOW()
      WHERE id = ${authz.adminId}
    `
    await logAdminAction(authz.adminId, authz.adminEmail, 'admin.2fa_setup', 'admin', authz.adminId)

    return NextResponse.json({
      success: true,
      otpauthUri: totpUri(secret, admin.email),
      secret: formatTotpSecret(secret),
    })
  } catch (e) {
    return handleRouteError(e, 'admin.account.2fa.setup')
  }
}
