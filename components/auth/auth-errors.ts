/**
 * Messages d'erreur des écrans d'authentification (connexion, inscription,
 * onboarding). Partagés entre les pages /login, /register et la modale.
 *
 * On n'utilise pas `apiFetch` ici : il redirige vers /login sur un 401, ce qui
 * n'a pas de sens sur les écrans de connexion eux-mêmes.
 */

export const NETWORK_ERROR = 'Connexion impossible. Vérifiez votre réseau et réessayez.'

/** Lit le corps JSON d'une réponse sans planter si ce n'est pas du JSON. */
export async function readJson(res: Response): Promise<any> {
  return res.json().catch(() => null)
}

function minutes(seconds: unknown): number | null {
  const n = Number(seconds)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.max(1, Math.ceil(n / 60))
}

/**
 * Message à afficher pour une réponse HTTP en échec : toujours le message
 * précis du serveur (`payload.error`) quand il existe, sinon un message
 * adapté au code HTTP.
 */
export function httpErrorMessage(res: Response, payload: any): string {
  const serverMessage = typeof payload?.error === 'string' && payload.error.trim() ? payload.error : null

  if (res.status === 429) {
    const retryAfter = minutes(payload?.retryAfter ?? res.headers.get('Retry-After'))
    const base = serverMessage ?? 'Trop de tentatives. Réessayez dans quelques minutes.'
    return retryAfter ? `${base} (environ ${retryAfter} min)` : base
  }
  if (serverMessage) return serverMessage
  if (res.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
  if (res.status === 403) return "Vous n'avez pas les droits pour cette action."
  if (res.status >= 500) return 'Le serveur a rencontré un problème. Réessayez dans un instant.'
  return 'La requête a échoué. Veuillez réessayer.'
}

/**
 * Traduit le résultat de `signIn('credentials', { redirect: false })`.
 *
 * NextAuth v5 ne transmet au client que des codes d'erreur, jamais le texte
 * des exceptions levées dans `authorize` :
 * - `CredentialsSignin` (+ `code`) : erreur « propre » (CredentialsSignin) ;
 * - `Configuration` : toute autre exception de `authorize` (aujourd'hui :
 *   mauvais identifiants, trop de tentatives ET entreprise suspendue lèvent
 *   toutes un `Error` simple, indiscernables côté client).
 */
export function credentialsErrorMessage(error: string, code?: string | null): string {
  if (error === 'CredentialsSignin') {
    switch (code) {
      case 'otp_required':
        return 'Saisissez le code à 6 chiffres de votre application d’authentification.'
      case 'otp_invalid':
        return 'Code de vérification incorrect ou expiré. Réessayez avec le code affiché.'
      case 'invalid_token':
        return 'Lien d’assistance invalide, expiré ou déjà utilisé. Relancez-le depuis l’administration.'
      case 'rate_limited':
        return 'Trop de tentatives. Réessayez dans quelques minutes.'
      case 'suspended':
        return 'Le compte de votre entreprise est suspendu. Contactez le support.'
      case 'disabled':
        return 'Votre compte a été désactivé. Contactez le responsable de votre entreprise.'
      default:
        return 'Email ou mot de passe incorrect.'
    }
  }
  if (error === 'Configuration') {
    return 'Connexion refusée : email ou mot de passe incorrect. Après plusieurs essais, la connexion est bloquée quelques minutes ; si le problème persiste, contactez le support.'
  }
  if (error === 'AccessDenied') return 'Accès refusé. Votre compte n’est pas autorisé.'
  return 'Une erreur est survenue lors de la connexion. Veuillez réessayer.'
}

