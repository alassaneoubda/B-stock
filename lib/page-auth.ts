import { redirect } from 'next/navigation'
import type { Session } from 'next-auth'
import { auth } from './auth'
import { sql } from './db'

/**
 * Garde des pages serveur du dashboard (équivalent de requireAuth pour l'UI).
 *
 * Le layout n'est pas ré-exécuté à chaque navigation client : chaque page
 * serveur qui lit la base doit donc vérifier elle-même que la session est
 * toujours valide (utilisateur actif, session non révoquée, entreprise non
 * suspendue). Redirige vers /login sinon.
 */
export async function requirePageSession(): Promise<Session> {
  const session = await auth()
  const user = session?.user
  if (!session || !user?.companyId || !user.id) redirect('/login')

  if (user.impersonatedBy && user.impersonationExpiresAt && user.impersonationExpiresAt < Date.now()) {
    redirect('/login?error=SessionExpired')
  }

  const rows = await sql`
    SELECT u.is_active, u.session_version, c.is_suspended
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

  return session
}
