import type { UserRole } from './types'

/**
 * Catalogue unique des rôles et permissions.
 *
 * - L'autorisation API repose UNIQUEMENT sur le rôle (owner = tout, sinon
 *   table role_permissions). Elle ne lit jamais les permissions personnalisées.
 * - `users.permissions` ne contient que des identifiants de MODULE servant à
 *   l'affichage de la navigation. Toute autre valeur est rejetée, ce qui
 *   empêche d'injecter des permissions API via un appel direct.
 */

export const ROLES: readonly UserRole[] = ['owner', 'manager', 'cashier', 'warehouse_keeper']

/** Rôles qu'un owner peut attribuer à un employé (owner unique par entreprise). */
export const ASSIGNABLE_ROLES = ['manager', 'cashier', 'warehouse_keeper'] as const
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Propriétaire',
  manager: 'Gérant',
  cashier: 'Caissier',
  warehouse_keeper: 'Magasinier',
}

/** Identifiants de module acceptés dans users.permissions (navigation). */
export const UI_MODULES = [
  'dashboard',
  'sales',
  'clients',
  'inventory',
  'products',
  'procurement',
  'suppliers',
  'deliveries',
  'vehicles',
  'reports',
  'settings',
] as const
export type UiModule = (typeof UI_MODULES)[number]

const UI_MODULE_SET = new Set<string>(UI_MODULES)

export function isAssignableRole(role: unknown): role is AssignableRole {
  return typeof role === 'string' && (ASSIGNABLE_ROLES as readonly string[]).includes(role)
}

/** Garde uniquement les modules connus, sans doublon. */
export function sanitizeModulePermissions(input: unknown): UiModule[] {
  if (!Array.isArray(input)) return []
  const out = new Set<UiModule>()
  for (const value of input) {
    if (typeof value === 'string' && UI_MODULE_SET.has(value)) out.add(value as UiModule)
  }
  return [...out]
}

/** Politique de mot de passe commune (inscription, création d'employé, changement). */
export const PASSWORD_MIN_LENGTH = 8

export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères`
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Le mot de passe doit contenir au moins une lettre et un chiffre'
  }
  return null
}
