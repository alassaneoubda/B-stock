import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Session } from 'next-auth'
import { auth } from './auth'
import { getEffectivePermissions } from './api-auth'
import { sql } from './db'
import { canAccessPath } from './route-permissions'
import type { UserRole } from './types'

export type PageSession = Session & {
  /** Permissions effectives relues en base ('*' pour le propriétaire). */
  access: { role: UserRole; permissions: string[] }
}

/**
 * Garde des pages serveur du dashboard (équivalent de requireAuth pour l'UI).
 *
 * Le layout n'est pas ré-exécuté à chaque navigation client : chaque page
 * serveur qui lit la base doit donc vérifier elle-même que la session est
 * toujours valide (utilisateur actif, session non révoquée, entreprise non
 * suspendue) et que le rôle donne accès à la page demandée.
 */
export async function requirePageSession(): Promise<PageSession> {
  const session = await auth()
  const user = session?.user
  if (!session || !user?.companyId || !user.id) redirect('/login')

  if (user.impersonatedBy && user.impersonationExpiresAt && user.impersonationExpiresAt < Date.now()) {
    redirect('/login?error=SessionExpired')
  }

  const rows = await sql`
    SELECT u.is_active, u.session_version, u.role, c.is_suspended
    FROM users u
    JOIN companies c ON c.id = u.company_id
    WHERE u.id = ${user.id} AND u.company_id = ${user.companyId}
  `
  const row = rows[0]
  if (!row || !row.is_active || Number(row.session_version) !== (user.sessionVersion ?? 0)) {
    redirect('/login?error=SessionExpired')
  }
  if (row.is_suspended && !user.impersonatedBy) {
    redirect('/login?error=CompanySuspended')
  }

  const role = row.role as UserRole
  const permissions = await getEffectivePermissions(role)

  // Chemin transmis par le proxy : refuse une page dont l'API répondrait 403
  const pathname = (await headers()).get('x-pathname')
  if (pathname && !canAccessPath(pathname, permissions)) {
    redirect('/dashboard?forbidden=1')
  }

  return {
    ...session,
    user: { ...user, role },
    access: { role, permissions },
  }
}
