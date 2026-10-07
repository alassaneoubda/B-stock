import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { sendPasswordResetEmail } from '@/lib/password-reset'
import { isUuid } from '@/lib/tenant'

// POST /api/users/[id]/reset-password
// Envoie à l'employé un lien de réinitialisation (60 min, usage unique).
// Le lien n'est renvoyé que si l'email n'a pas pu partir (à transmettre en main propre).
// Ses sessions sont fermées quand il choisit son nouveau mot de passe.
export async function POST(
  _request: NextRequest,
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
      SELECT id, email, full_name, role, is_active FROM users
      WHERE id = ${id} AND company_id = ${authz.companyId}
    `
    if (!user) throw notFound('Utilisateur')

    if (user.role === 'owner') {
      throw new AppError(403, 'Le mot de passe du propriétaire ne peut pas être réinitialisé ici', 'OWNER_PROTECTED')
    }
    if (user.role === 'manager' && authz.role !== 'owner') {
      throw new AppError(403, 'Seul le propriétaire peut réinitialiser un gérant', 'OWNER_ONLY')
    }
    if (!user.is_active) {
      throw new AppError(400, 'Ce compte est désactivé : réactivez-le d’abord', 'ACCOUNT_DISABLED')
    }

    const result = await sendPasswordResetEmail({ id: user.id, email: user.email, full_name: user.full_name })

    await sql`
      INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
      VALUES (${authz.companyId}, ${authz.userId}, 'password_reset_link', 'user', ${user.id},
              ${JSON.stringify({ email: user.email, emailed: result.emailed })})
    `.catch((e: unknown) => console.error('[users.reset-password] audit', e))

    return NextResponse.json({
      success: true,
      emailed: result.emailed,
      email: user.email,
      expiresAt: result.expiresAt.toISOString(),
      ...(result.emailed ? {} : { link: result.url }),
    })
  } catch (error) {
    return handleRouteError(error, 'users.reset-password')
  }
}
