'use client'

import { toast } from 'sonner'

/**
 * Client HTTP unique des écrans du dashboard.
 *
 * Avant : chaque page faisait son `fetch`, ignorait souvent `res.ok` et
 * affichait un succès même quand le serveur refusait l'opération.
 * Désormais : toute réponse non-2xx lève une ApiError portant le message du
 * serveur (déjà en français), que l'écran affiche avec `toastError`.
 *
 *   try {
 *     const { data } = await apiFetch('/api/clients', { method: 'POST', body: form })
 *     toast.success('Client créé')
 *   } catch (e) {
 *     toastError(e)
 *   }
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type ApiInit = Omit<RequestInit, 'body'> & {
  /** Objet sérialisé en JSON (ou BodyInit brut). */
  body?: unknown
}

const NETWORK_MESSAGE = 'Connexion impossible. Vérifiez votre réseau et réessayez.'

export async function apiFetch<T = any>(url: string, init: ApiInit = {}): Promise<T> {
  const { body, headers, ...rest } = init
  const isRaw = body instanceof FormData || typeof body === 'string' || body instanceof Blob
  let res: Response
  try {
    res = await fetch(url, {
      ...rest,
      headers: isRaw || body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : isRaw ? (body as BodyInit) : JSON.stringify(body),
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new ApiError(NETWORK_MESSAGE, 0, 'NETWORK')
  }

  const payload = await res.json().catch(() => null)

  if (!res.ok) {
    // Session révoquée ou expirée : retour à la connexion (qui purge le cookie)
    if (res.status === 401 && typeof window !== 'undefined') {
      const isAdmin = window.location.pathname.startsWith('/admin')
      window.location.assign(isAdmin ? '/admin/login' : '/login?error=SessionExpired')
    }
    throw new ApiError(
      payload?.error || defaultMessage(res.status),
      res.status,
      payload?.code,
      payload?.details
    )
  }

  return payload as T
}

function defaultMessage(status: number): string {
  if (status === 402) return 'Votre abonnement a expiré. Renouvelez-le pour continuer.'
  if (status === 403) return "Vous n'avez pas les droits pour cette action."
  if (status === 404) return 'Élément introuvable.'
  if (status === 409) return 'Opération impossible dans l’état actuel.'
  if (status === 429) return 'Trop de tentatives. Patientez quelques minutes.'
  if (status >= 500) return 'Le serveur a rencontré un problème. Réessayez dans un instant.'
  return 'La requête a échoué.'
}

/** Message lisible pour n'importe quelle erreur attrapée. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Une erreur inattendue est survenue.'
}

/** Affiche l'erreur dans un toast (titre court + message du serveur). */
export function toastError(error: unknown, title = 'Action impossible') {
  if ((error as Error)?.name === 'AbortError') return
  toast.error(title, { description: errorMessage(error) })
}

/** Affiche les avertissements non bloquants renvoyés par l'API (ex. caisse fermée). */
export function toastWarnings(warnings: unknown) {
  if (!Array.isArray(warnings)) return
  for (const w of warnings) if (typeof w === 'string') toast.warning(w, { duration: 10_000 })
}
