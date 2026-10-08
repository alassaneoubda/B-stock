'use client'

/**
 * État du réseau vu par l'application : `navigator.onLine` ne suffit pas (Wi-Fi
 * connecté sans internet, coupure de l'opérateur…). Un appel API qui échoue au
 * niveau réseau marque le réseau comme indisponible jusqu'au prochain succès.
 */

type Listener = () => void
let networkDown = false
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l()
}

export function subscribeNetwork(listener: Listener): () => void {
  listeners.add(listener)
  if (typeof window !== 'undefined' && listeners.size === 1) {
    window.addEventListener('online', onBrowserOnline)
    window.addEventListener('offline', emit)
  }
  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined' && listeners.size === 0) {
      window.removeEventListener('online', onBrowserOnline)
      window.removeEventListener('offline', emit)
    }
  }
}

function onBrowserOnline() {
  // Le navigateur signale le retour du réseau : on retentera, l'échec suivant rebasculera
  networkDown = false
  emit()
}

export function isOffline(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return networkDown
}

export function reportNetworkFailure() {
  if (!networkDown) {
    networkDown = true
    emit()
  }
}

export function reportNetworkSuccess() {
  if (networkDown) {
    networkDown = false
    emit()
  }
}

/** Erreur d'apiFetch due au réseau (et non à un refus du serveur). */
export function isNetworkError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'NETWORK')
}

/**
 * Sonde le serveur sans passer par le cache du service worker (/api n'est jamais
 * intercepté). Renvoie l'utilisateur connecté (null si déconnecté) ou
 * `undefined` si le serveur est injoignable.
 */
export async function probeSession(timeoutMs = 8000): Promise<{ id: string; companyId: string } | null | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
    if (!res.ok) {
      if (res.status >= 500) return undefined
      return null
    }
    reportNetworkSuccess()
    const body = (await res.json().catch(() => null)) as { user?: { id?: string; companyId?: string } } | null
    return body?.user?.id && body.user.companyId ? { id: body.user.id, companyId: body.user.companyId } : null
  } catch {
    reportNetworkFailure()
    return undefined
  } finally {
    clearTimeout(timer)
  }
}
