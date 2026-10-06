import { NextRequest, NextResponse } from 'next/server'
import { compare, hash } from 'bcryptjs'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
import { passwordPolicyError } from '@/lib/permissions'
import { rateLimit } from '@/lib/rate-limit'

const schema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().max(200),
})

// POST /api/profile/password — l'utilisateur change son propre mot de passe.
// Toutes ses sessions (y compris celle-ci) sont ensuite invalidées.
export async function POST(request: NextRequest) {
  try {
    // Accessible même abonnement expiré : un compte doit rester sécurisable
    const authz = await requireAuth({ skipSubscriptionCheck: true })
    if (!authz.ok) return authz.response
    if (authz.isImpersonating) {
      throw new AppError(403, "Action impossible en mode assistance", 'IMPERSONATION')
    }

    const limited = await rateLimit('password-change', authz.userId, { limit: 5, windowSeconds: 900 })
    if (limited) return limited

    const data = schema.parse(await request.json())

    const policyError = passwordPolicyError(data.newPassword)
    if (policyError) throw new AppError(400, policyError, 'WEAK_PASSWORD')

    const [user] = await sql`
      SELECT password_hash FROM users WHERE id = ${authz.userId} AND company_id = ${authz.companyId}
    `
    // Comptes Google sans mot de passe local : premier mot de passe sans ancien
    if (user?.password_hash) {
      const ok = data.currentPassword ? await compare(data.currentPassword, user.password_hash) : false
      if (!ok) throw new AppError(400, 'Mot de passe actuel incorrect', 'WRONG_PASSWORD')
      if (await compare(data.newPassword, user.password_hash)) {
        throw new AppError(400, "Le nouveau mot de passe doit être différent de l'actuel", 'SAME_PASSWORD')
      }
    }

    const passwordHash = await hash(data.newPassword, 12)
    await sql`
      UPDATE users
      SET password_hash = ${passwordHash}, session_version = session_version + 1, updated_at = NOW()
      WHERE id = ${authz.userId} AND company_id = ${authz.companyId}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'profile.password')
  }
}
