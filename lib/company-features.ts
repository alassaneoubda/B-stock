import { sql } from './db'
import { forbidden } from './errors'
import { isFeatureEnabled, type FeatureFlagKey } from './feature-flags'

/** Messages affichés quand une fonctionnalité est désactivée pour l'entreprise. */
export const FEATURE_DISABLED_MESSAGES: Record<FeatureFlagKey, string> = {
  pos: "Le point de vente n'est pas activé pour votre compte",
}

/** Lit en base si une fonctionnalité est active pour une entreprise (serveur uniquement). */
export async function companyHasFeature(companyId: string, key: FeatureFlagKey): Promise<boolean> {
  const [row] = await sql`SELECT feature_flags FROM companies WHERE id = ${companyId}`
  return isFeatureEnabled(row?.feature_flags, key)
}

/** Lève une erreur 403 (AppError) si la fonctionnalité est désactivée. */
export async function assertCompanyFeature(companyId: string, key: FeatureFlagKey): Promise<void> {
  if (!(await companyHasFeature(companyId, key))) {
    throw forbidden(FEATURE_DISABLED_MESSAGES[key])
  }
}
