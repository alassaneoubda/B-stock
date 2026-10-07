import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { auth } from './auth'
import { sql } from './db'
import { getSettings } from './settings'
import { evaluateSubscription } from './subscription'
import type { UserRole } from './types'

/**
 * Centralized API authorization helpers.
 *
 * Usage in a route handler:
 *
 *   const authz = await requirePermission('sales.write')
 *   if (!authz.ok) return authz.response
 *   const { companyId, userId, role } = authz
 *
 * Le JWT ne sert qu'à identifier l'utilisateur. Tout le reste est relu en base
 * à chaque requête, en UNE seule requête SQL :
 *  - utilisateur inexistant / désactivé / session révoquée -> 401
 *  - entreprise suspendue                                  -> 403
 *  - plateforme en maintenance                             -> 503
 *  - abonnement inactif (par défaut)                       -> 402
 *  - role === 'owner'                                      -> toutes permissions
 *  - permission dans role_permissions                      -> autorisé
 *  - sinon                                                 -> 403
 * Les sessions d'impersonation (support) ignorent abonnement et maintenance.
 */

export type AuthSuccess = {
  ok: true
  session: Session
  companyId: string
  userId: string
  /** Rôle relu en base (et non celui figé dans le JWT). */
  role: UserRole
  isImpersonating: boolean
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

function fail(status: number, error: string, code: string, extra?: Record<string, unknown>): AuthFailure {
  return { ok: false, response: NextResponse.json({ error, code, ...extra }, { status }) }
}

type AccessRow = {
  role: UserRole
  is_active: boolean
  session_version: number
  is_suspended: boolean | null
  subscription_status: string | null
  trial_ends_at: string | null
  subscription_ends_at: string | null
}

/** Require an authenticated, active user belonging to an active company. */
export async function requireAuth(options: AuthOptions = {}): Promise<AuthResult> {
  const session = await auth()
  const user = session?.user
  if (!session || !user?.companyId || !user.id) {
    return fail(401, 'Non autorisé', 'UNAUTHENTICATED')
  }

  const isImpersonating = Boolean(user.impersonatedBy)
  if (isImpersonating && user.impersonationExpiresAt && user.impersonationExpiresAt < Date.now()) {
    return fail(401, "Session d'assistance expirée", 'IMPERSONATION_EXPIRED')
  }

  let row: AccessRow | undefined
  try {
    const rows = await sql`
      SELECT u.role, u.is_active, u.session_version,
             c.is_suspended, c.subscription_status, c.trial_ends_at, c.subscription_ends_at
      FROM users u
      JOIN companies c ON c.id = u.company_id
      WHERE u.id = ${user.id} AND u.company_id = ${user.companyId}
    `
    row = rows[0] as AccessRow | undefined
  } catch (err) {
    console.error('[api-auth] access check failed:', err)
    return fail(500, 'Erreur de vérification des accès', 'INTERNAL')
  }

  if (!row || !row.is_active || row.session_version !== (user.sessionVersion ?? 0)) {
    return fail(401, 'Session expirée, veuillez vous reconnecter', 'SESSION_REVOKED')
  }

  if (row.is_suspended && !isImpersonating) {
    return fail(403, 'Compte entreprise suspendu. Contactez le support.', 'COMPANY_SUSPENDED')
  }

  if (!isImpersonating) {
    const settings = await getSettings()
    if (settings.maintenance_mode) {
      return fail(503, settings.maintenance_message, 'MAINTENANCE')
    }

    if (!options.skipSubscriptionCheck) {
      const sub = evaluateSubscription(row)
      if (!sub.isActive) {
        return fail(
          402,
          'Abonnement expiré ou inactif. Renouvelez votre plan pour continuer.',
          'SUBSCRIPTION_INACTIVE',
          { status: sub.status }
        )
      }
    }
  }

  return {
    ok: true,
    session,
    companyId: user.companyId,
    userId: user.id,
    role: row.role,
    isImpersonating,
  }
}

// ----- Permissions par rôle (table globale, mise en cache mémoire) -----

let rolePermsCache: { data: Map<string, Set<string>>; at: number } | null = null
const ROLE_PERMS_TTL_MS = 60_000

async function getRolePermissionMap(): Promise<Map<string, Set<string>>> {
  if (rolePermsCache && Date.now() - rolePermsCache.at < ROLE_PERMS_TTL_MS) {
    return rolePermsCache.data
  }
  const rows = await sql`SELECT role, permission FROM role_permissions`
  const map = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!map.has(r.role)) map.set(r.role, new Set())
    map.get(r.role)!.add(r.permission)
  }
  rolePermsCache = { data: map, at: Date.now() }
  return map
}

/** Permissions effectives d'un rôle, pour l'UI ('*' = toutes, cas du propriétaire). */
export async function getEffectivePermissions(role: UserRole): Promise<string[]> {
  if (role === 'owner') return ['*']
  const map = await getRolePermissionMap()
  return [...(map.get(role) ?? [])]
}

export async function roleHasPermission(role: UserRole, permission: string): Promise<boolean> {
  if (role === 'owner') return true
  const map = await getRolePermissionMap()
  return map.get(role)?.has(permission) ?? false
}

/** Require a specific permission (owner = toutes les permissions). */
export async function requirePermission(
  permission: string,
  options: AuthOptions = {}
): Promise<AuthResult> {
  const result = await requireAuth(options)
  if (!result.ok) return result

  try {
    if (await roleHasPermission(result.role, permission)) return result
  } catch (err) {
    console.error('Permission check failed:', err)
    return fail(500, 'Erreur de vérification des permissions', 'INTERNAL')
  }

  return fail(403, 'Accès refusé : permission insuffisante', 'FORBIDDEN')
}

/** Require the company owner (gestion de l'abonnement, des propriétaires…). */
export async function requireOwner(options: AuthOptions = {}): Promise<AuthResult> {
  const result = await requireAuth(options)
  if (!result.ok) return result
  if (result.role !== 'owner') {
    return fail(403, 'Action réservée au propriétaire du compte', 'OWNER_ONLY')
  }
  return result
}
