import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { handleRouteError, notFound } from '@/lib/errors'
import { sendPasswordResetEmail } from '@/lib/password-reset'
import { isUuid } from '@/lib/tenant'

// POST /api/admin/users/:id/reset-password
// Envoie un lien de réinitialisation (60 min, usage unique) à l'utilisateur.
// Aucun mot de passe n'est généré ni affiché : le lien n'est renvoyé que si
// l'email n'a pas pu partir (l'administrateur le transmet alors lui-même).
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireAdmin('users.reset')
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    if (!isUuid(id)) throw notFound('Utilisateur')

    const [user] = await sql`SELECT id, email, full_name, is_active FROM users WHERE id = ${id}`
    if (!user) throw notFound('Utilisateur')
    if (!user.is_active) {
      return NextResponse.json({ error: 'Ce compte est désactivé : réactivez-le d’abord' }, { status: 400 })
    }

    const result = await sendPasswordResetEmail(
      { id: user.id, email: user.email, full_name: user.full_name },
      { adminId: authz.adminId }
    )

    await logAdminAction(authz.adminId, authz.adminEmail, 'user.reset_password_link', 'user', id, {
      emailed: result.emailed,
    })

    return NextResponse.json({
      success: true,
      emailed: result.emailed,
      email: user.email,
      expiresAt: result.expiresAt.toISOString(),
      ...(result.emailed ? {} : { link: result.url }),
    })
  } catch (e) {
    return handleRouteError(e, 'admin.users.reset-password')
  }
}
