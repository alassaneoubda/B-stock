import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { auth, hasPermission } from './auth'
import { getSubscriptionInfo } from './subscription'

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
 *  - Inactive subscription (default)  -> 402
 *  - role === 'owner'                 -> always allowed (permission)
 *  - permission in session perms      -> allowed
 *  - permission in role_permissions   -> allowed
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

export type AuthOptions = {
  /** Skip trial/subscription gate (billing, subscription status, etc.) */
  skipSubscriptionCheck?: boolean
}

async function enforceSubscription(companyId: string): Promise<AuthFailure | null> {
  try {
    const sub = await getSubscriptionInfo(companyId)
    if (sub.isActive) return null
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Abonnement expiré ou inactif. Renouvelez votre plan pour continuer.',
          code: 'SUBSCRIPTION_INACTIVE',
          status: sub.status,
        },
        { status: 402 }
      ),
    }
  } catch (err) {
    console.error('Subscription check failed:', err)
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Erreur de vérification de l’abonnement' },
        { status: 500 }
      ),
    }
  }
}

/** Require an authenticated user belonging to a company. */
export async function requireAuth(options: AuthOptions = {}): Promise<AuthResult> {
  const session = await auth()
  if (!session?.user?.companyId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }),
    }
  }

  // Impersonation sessions keep working even if billing is odd (support)
  const isImpersonating = Boolean(session.user.impersonatedBy)

  if (!options.skipSubscriptionCheck && !isImpersonating) {
    const blocked = await enforceSubscription(session.user.companyId)
    if (blocked) return blocked
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
export async function requirePermission(
  permission: string,
  options: AuthOptions = {}
): Promise<AuthResult> {
  const result = await requireAuth(options)
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
