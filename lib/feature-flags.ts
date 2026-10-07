/**
 * Fonctionnalités activables par entreprise (colonne `companies.feature_flags`, JSONB).
 *
 * Une clé absente du JSON = valeur par défaut de la fonctionnalité : ajouter une
 * entrée ici ne change rien pour les entreprises existantes tant que `default` est true.
 * Module sans dépendance serveur : utilisable côté client (back-office) comme serveur.
 */

export type FeatureFlagKey = 'pos'

export type FeatureFlagDefinition = {
  key: FeatureFlagKey
  label: string
  description: string
  default: boolean
}

export const FEATURE_FLAGS: readonly FeatureFlagDefinition[] = [
  {
    key: 'pos',
    label: 'Point de vente',
    description: 'Caisse plein écran pour maquis et bars : tables, commandes, encaissement au comptoir.',
    default: true,
  },
] as const

export type FeatureFlags = Partial<Record<FeatureFlagKey, boolean>>

export function isFeatureFlagKey(key: string): key is FeatureFlagKey {
  return FEATURE_FLAGS.some((f) => f.key === key)
}

/** Valeur effective d'une fonctionnalité (flag explicite, sinon valeur par défaut). */
export function isFeatureEnabled(flags: unknown, key: FeatureFlagKey): boolean {
  const def = FEATURE_FLAGS.find((f) => f.key === key)
  const value = flags && typeof flags === 'object' ? (flags as Record<string, unknown>)[key] : undefined
  return typeof value === 'boolean' ? value : (def?.default ?? true)
}

/** Toutes les fonctionnalités avec leur valeur effective. */
export function resolveFeatureFlags(flags: unknown): Record<FeatureFlagKey, boolean> {
  return Object.fromEntries(FEATURE_FLAGS.map((f) => [f.key, isFeatureEnabled(flags, f.key)])) as Record<
    FeatureFlagKey,
    boolean
  >
}
