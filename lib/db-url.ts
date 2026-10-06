/** Vrai si DATABASE_URL pointe vers une base locale (dev Docker, sans SSL). */
export function isLocalDatabaseUrl(url: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname)
  } catch {
    return false
  }
}

/**
 * Normalise DATABASE_URL pour `pg` (évite le warning sslmode / verify-full).
 * - Ajoute uselibpqcompat=true (compat libpq)
 * - Garde sslmode=require
 * - Retire channel_binding=require (souvent présent dans les URLs Neon, inutile avec pg)
 * Les URLs locales sont laissées intactes (pas de SSL en dev).
 */
export function normalizeDatabaseUrl(url: string): string {
  if (isLocalDatabaseUrl(url)) return url
  try {
    const u = new URL(url)
    u.searchParams.set('sslmode', 'require')
    u.searchParams.set('uselibpqcompat', 'true')
    u.searchParams.delete('channel_binding')
    return u.toString()
  } catch {
    return url
  }
}
