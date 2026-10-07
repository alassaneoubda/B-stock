import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { sendPasswordResetEmail } from '@/lib/password-reset'
import { clientIp, isRateLimited, rateLimit } from '@/lib/rate-limit'

/**
 * POST /api/auth/forgot-password  { email }
 * Libre-service pour les utilisateurs des entreprises.
 *
 * Réponse TOUJOURS identique (compte connu ou non, désactivé, administrateur…)
 * pour ne pas permettre de deviner quels emails ont un compte.
 * Les administrateurs de la plateforme sont exclus (réinitialisation par un super-admin).
 */

const GENERIC_FORGOT_MESSAGE =
  'Si un compte actif correspond à cette adresse, un lien de réinitialisation vient d’y être envoyé. Il est valable 60 minutes.'

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse email invalide').max(255),
})

export async function POST(request: Request) {
  try {
    const limited = await rateLimit('forgot-ip', clientIp(request.headers), { limit: 10, windowSeconds: 900 })
    if (limited) return limited

    const parsed = schema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Adresse email invalide', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }
    const { email } = parsed.data

    // Limite par adresse : silencieuse (même réponse), pour ne rien révéler
    const emailLimited = await isRateLimited('forgot-email', email, { limit: 3, windowSeconds: 3600 })

    if (!emailLimited) {
      const [isAdmin] = await sql`SELECT 1 FROM platform_admins WHERE lower(email) = ${email} LIMIT 1`
      if (!isAdmin) {
        const [user] = await sql`
          SELECT id, email, full_name FROM users
          WHERE lower(email) = ${email} AND is_active = true
          LIMIT 1
        `
        if (user) {
          try {
            await sendPasswordResetEmail({ id: user.id, email: user.email, full_name: user.full_name })
          } catch (e) {
            // Ne jamais exposer l'échec : réponse générique quoi qu'il arrive
            console.error('[forgot-password] envoi du lien impossible', e)
          }
        }
      }
    }

    return NextResponse.json({ success: true, message: GENERIC_FORGOT_MESSAGE })
  } catch (error) {
    return handleRouteError(error, 'auth.forgot-password')
  }
}
