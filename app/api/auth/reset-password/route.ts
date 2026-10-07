import { NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/errors'
import { consumeResetToken } from '@/lib/password-reset'
import { clientIp, rateLimit } from '@/lib/rate-limit'

/**
 * POST /api/auth/reset-password  { token, password }
 * Consomme un lien de réinitialisation (usage unique, 60 min) et ferme toutes
 * les sessions de l'utilisateur. La politique de mot de passe est appliquée
 * par consumeResetToken.
 */

const schema = z.object({
  token: z.string().min(20, 'Lien invalide').max(200),
  password: z.string().min(1, 'Mot de passe requis').max(200),
})

export async function POST(request: Request) {
  try {
    const limited = await rateLimit('reset-password-ip', clientIp(request.headers), { limit: 20, windowSeconds: 900 })
    if (limited) return limited

    const parsed = schema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Données invalides', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    await consumeResetToken(parsed.data.token, parsed.data.password)
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'auth.reset-password')
  }
}
