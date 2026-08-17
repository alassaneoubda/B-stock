/**
 * Normalise DATABASE_URL pour `pg` (évite le warning sslmode / verify-full).
 * - Ajoute uselibpqcompat=true (compat libpq)
 * - Garde sslmode=require
 * - Retire channel_binding=require (souvent présent dans les URLs Neon, inutile avec pg)
 */
export function normalizeDatabaseUrl(url: string): string {
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
