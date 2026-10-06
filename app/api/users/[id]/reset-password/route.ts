import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { randomBytes } from 'crypto'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { passwordPolicyError } from '@/lib/permissions'
import { isUuid } from '@/lib/tenant'

/** Mot de passe temporaire lisible (sans caractères ambigus), conforme à la politique. */
function generateTempPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ'
  const bytes = randomBytes(8)
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return `${out}${100 + (randomBytes(1)[0] % 900)}`
}

// POST /api/users/[id]/reset-password
// Réinitialise le mot de passe d'un employé et déconnecte ses sessions.
// Le mot de passe temporaire est renvoyé une seule fois (à communiquer à l'employé).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await requirePermission('users.write')
    if (!authz.ok) return authz.response
    const { id } = await params
    if (!isUuid(id)) throw notFound('Utilisateur')

    if (id === authz.userId) {
      throw new AppError(400, 'Utilisez « Sécurité » pour changer votre propre mot de passe', 'SELF_RESET')
    }

    const [user] = await sql`
      SELECT id, email, role FROM users
      WHERE id = ${id} AND company_id = ${authz.companyId}
    `
    if (!user) throw notFound('Utilisateur')

    if (user.role === 'owner') {
      throw new AppError(403, 'Le mot de passe du propriétaire ne peut pas être réinitialisé ici', 'OWNER_PROTECTED')
    }
    if (user.role === 'manager' && authz.role !== 'owner') {
      throw new AppError(403, 'Seul le propriétaire peut réinitialiser un gérant', 'OWNER_ONLY')
    }

    const body = await request.json().catch(() => ({}))
    let tempPassword = generateTempPassword()
    if (typeof body.password === 'string' && body.password.length > 0) {
      const policyError = passwordPolicyError(body.password)
      if (policyError) throw new AppError(400, policyError, 'WEAK_PASSWORD')
      tempPassword = body.password
    }

    const passwordHash = await hash(tempPassword, 12)

    await sql`
      UPDATE users
      SET password_hash = ${passwordHash}, auth_provider = 'credentials',
          session_version = session_version + 1, updated_at = NOW()
      WHERE id = ${id} AND company_id = ${authz.companyId}
    `

    return NextResponse.json({ success: true, tempPassword, email: user.email })
  } catch (error) {
    return handleRouteError(error, 'users.reset-password')
  }
}
