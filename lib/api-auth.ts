import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { auth, hasPermission } from './auth'

/**
 * Centralized API authorization helpers.
 *
 * Usage in a route handler:
 *
 *   const authz = await requirePermission('sales.write')
 *   if (!authz.ok) return authz.response
 *   const { session, companyId } = authz
 *
 * Rules:
 *  - No session                       -> 401
 *  - role === 'owner'                 -> always allowed
 *  - permission in session perms      -> allowed (custom per-user permissions)
 *  - permission in role_permissions   -> allowed (DB source of truth, per role)
 *  - otherwise                        -> 403
 */

export type AuthSuccess = {
  ok: true
  session: Session
  companyId: string
  userId: string
  role: Session['user']['role']
}

export type AuthFailure = {
  ok: false
  response: NextResponse
}

export type AuthResult = AuthSuccess | AuthFailure

/** Require an authenticated user belonging to a company. */
export async function requireAuth(): Promise<AuthResult> {
  const session = await auth()
  if (!session?.user?.companyId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }),
    }
  }
  return {
    ok: true,
    session,
    companyId: session.user.companyId,
    userId: session.user.id,
    role: session.user.role,
  }
}

/** Require a specific permission (with owner bypass). */
export async function requirePermission(permission: string): Promise<AuthResult> {
  const result = await requireAuth()
  if (!result.ok) return result

  const { session } = result
  const role = session.user.role

  // Owner always has full access
  if (role === 'owner') return result

  // Custom per-user permissions carried in the session
  const sessionPerms = session.user.permissions || []
  if (sessionPerms.includes(permission)) return result

  // Role-based permissions (DB source of truth)
  try {
    if (await hasPermission(role, permission)) return result
  } catch (err) {
    console.error('Permission check failed:', err)
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Erreur de vérification des permissions' },
        { status: 500 }
      ),
    }
  }

  return {
    ok: false,
    response: NextResponse.json(
      { error: 'Accès refusé : permission insuffisante' },
      { status: 403 }
    ),
  }
}
