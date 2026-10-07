import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { auth } from './auth'
import { sql } from './db'

/**
 * Administration de la plateforme : rôles et capacités.
 *
 * - super_admin : tout (paramètres, plans, CMS, administrateurs, suppression…)
 * - support     : suivi des clients, assistance (connexion en tant que client),
 *                 réinitialisation d'accès, annonces
 * - finance     : paiements, abonnements, rapports
 *
 * Les droits sont relus en base à chaque requête (admin désactivé ou rétrogradé
 * = effet immédiat, malgré le JWT de 30 jours).
 */

export type AdminRole = 'super_admin' | 'support' | 'finance'

export type AdminCapability =
  | 'companies.read'
  | 'companies.notes'
  | 'companies.trial'
  | 'companies.plan'
  | 'companies.impersonate'
  | 'companies.suspend'
  | 'companies.delete'
  | 'companies.features'
  | 'users.read'
  | 'users.reset'
  | 'billing.read'
  | 'billing.write'
  | 'plans.read'
  | 'plans.write'
  | 'reports.read'
  | 'announcements.manage'
  | 'cms.manage'
  | 'settings.manage'
  | 'webhooks.manage'
  | 'audit.read'
  | 'health.read'
  | 'admins.manage'

const ROLE_CAPABILITIES: Record<AdminRole, AdminCapability[] | '*'> = {
  super_admin: '*',
  support: [
    'companies.read', 'companies.notes', 'companies.trial', 'companies.impersonate',
    'users.read', 'users.reset', 'announcements.manage', 'audit.read', 'health.read', 'plans.read',
  ],
  finance: [
    'companies.read', 'companies.notes', 'companies.plan', 'companies.trial',
    'billing.read', 'billing.write', 'plans.read', 'reports.read', 'webhooks.manage', 'audit.read', 'health.read',
  ],
}

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super-administrateur',
  support: 'Support client',
  finance: 'Finance',
}

export function adminCan(role: AdminRole, capability: AdminCapability): boolean {
  const caps = ROLE_CAPABILITIES[role]
  return caps === '*' || caps.includes(capability)
}

/** Capacités d'un rôle (pour masquer l'interface ; l'API reste l'autorité). */
export function adminCapabilities(role: AdminRole): AdminCapability[] | '*' {
  return ROLE_CAPABILITIES[role] ?? []
}

type AdminSuccess = {
  ok: true
  session: Session
  adminId: string
  adminEmail: string
  role: AdminRole
}
type AdminFailure = { ok: false; response: NextResponse }
export type AdminAuthResult = AdminSuccess | AdminFailure

function fail(status: number, error: string): AdminFailure {
  return { ok: false, response: NextResponse.json({ error }, { status }) }
}

/** Guard des routes /api/admin/* : administrateur actif + capacité requise. */
export async function requireAdmin(capability?: AdminCapability): Promise<AdminAuthResult> {
  const session = await auth()
  if (!session?.user) return fail(401, 'Non authentifié')
  if (!session.user.isPlatformAdmin) return fail(403, 'Accès administrateur requis')

  const [admin] = await sql`
    SELECT role, session_version FROM platform_admins WHERE id = ${session.user.id} AND is_active = true
  `
  if (!admin || Number(admin.session_version) !== (session.user.sessionVersion ?? 0)) {
    return fail(401, 'Session expirée')
  }
  const role = (admin.role as AdminRole) ?? 'support'
  if (capability && !adminCan(role, capability)) {
    return fail(403, 'Votre rôle ne permet pas cette action')
  }
  return { ok: true, session, adminId: session.user.id, adminEmail: session.user.email, role }
}

/** Réservé aux super-administrateurs (compatibilité des routes existantes). */
export async function requireSuperAdmin(): Promise<AdminAuthResult> {
  const result = await requireAdmin()
  if (!result.ok) return result
  if (result.role !== 'super_admin') return fail(403, 'Action réservée aux super-administrateurs')
  return result
}

/**
 * Record a platform-level action in the audit trail. Best-effort (never throws).
 */
export async function logAdminAction(
  adminId: string,
  adminEmail: string,
  action: string,
  targetType?: string | null,
  targetId?: string | null,
  metadata?: Record<string, unknown> | null
): Promise<void> {
  try {
    await sql`
      INSERT INTO platform_audit_logs
        (admin_id, admin_email, action, target_type, target_id, metadata)
      VALUES
        (${adminId}, ${adminEmail}, ${action}, ${targetType ?? null},
         ${targetId ?? null}, ${metadata ? JSON.stringify(metadata) : null})
    `
  } catch (e) {
    console.error('[admin-audit] échec écriture log:', e)
  }
}
