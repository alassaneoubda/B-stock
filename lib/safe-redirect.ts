/**
 * N'accepte qu'un chemin interne ("/dashboard/..."). Rejette les URLs absolues
 * et les formes protocol-relative ("//evil.com", "/\\evil.com") qui
 * permettaient une redirection ouverte après connexion.
 */
export function safeCallbackUrl(url: string | null | undefined, fallback = '/dashboard'): string {
  if (!url || typeof url !== 'string') return fallback
  if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return fallback
  return url
}
