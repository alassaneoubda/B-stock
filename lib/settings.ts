import { sql } from './db'

/**
 * Configuration globale de la plateforme (back office).
 * Stockée dans `platform_settings` (clé/valeur JSONB), avec valeurs par défaut
 * et un cache mémoire court pour limiter les requêtes.
 */

export type PlatformSettings = {
  platform_name: string
  support_email: string
  support_phone: string
  default_currency: string
  default_timezone: string
  trial_days: number
  registrations_open: boolean
  google_oauth_enabled: boolean
  maintenance_mode: boolean
  maintenance_message: string
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  platform_name: 'B-Stock',
  support_email: 'support@b-stock.ci',
  support_phone: '',
  default_currency: 'XOF',
  default_timezone: 'Africa/Abidjan',
  trial_days: 30,
  registrations_open: true,
  google_oauth_enabled: true,
  maintenance_mode: false,
  maintenance_message: 'Plateforme en maintenance. Merci de revenir dans quelques instants.',
}

let cache: { data: PlatformSettings; at: number } | null = null
const TTL_MS = 30_000

/** Lit toute la configuration (fusionnée avec les valeurs par défaut). */
export async function getSettings(force = false): Promise<PlatformSettings> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return cache.data
  }
  try {
    const rows = await sql`SELECT key, value FROM platform_settings`
    const merged: PlatformSettings = { ...DEFAULT_SETTINGS }
    for (const row of rows) {
      if (row.key in merged) {
        // value JSONB est déjà désérialisé par le driver Neon
        ;(merged as Record<string, unknown>)[row.key] = row.value
      }
    }
    cache = { data: merged, at: Date.now() }
    return merged
  } catch (e) {
    console.error('[settings] lecture échouée, valeurs par défaut utilisées:', e)
    return { ...DEFAULT_SETTINGS }
  }
}

/** Récupère une seule valeur de configuration. */
export async function getSetting<K extends keyof PlatformSettings>(
  key: K
): Promise<PlatformSettings[K]> {
  const s = await getSettings()
  return s[key]
}

/** Met à jour un sous-ensemble de la configuration (best-effort, validé en amont). */
export async function updateSettings(
  partial: Partial<PlatformSettings>,
  updatedBy?: string
): Promise<PlatformSettings> {
  const entries = Object.entries(partial).filter(([k]) => k in DEFAULT_SETTINGS)
  for (const [key, value] of entries) {
    await sql`
      INSERT INTO platform_settings (key, value, updated_at, updated_by)
      VALUES (${key}, ${JSON.stringify(value)}::jsonb, NOW(), ${updatedBy ?? null})
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by
    `
  }
  cache = null
  return getSettings(true)
}

/** Invalide le cache mémoire. */
export function invalidateSettingsCache() {
  cache = null
}
