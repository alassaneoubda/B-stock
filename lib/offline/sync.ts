'use client'

import { classifyResponse, markAttemptFailed, markRejected, markSent, nextPending, ownerKey, type OfflineSale } from './queue'
import { probeSession, reportNetworkFailure, reportNetworkSuccess } from './network'
import { readQueue, updateQueue } from './store'

/**
 * Envoi de la file des ventes hors ligne : dans l'ordre, une par une.
 *
 * Jamais deux envois en parallèle, même avec plusieurs onglets :
 * - `navigator.locks` (verrou exclusif partagé par les onglets de l'origine) ;
 * - à défaut, un bail dans localStorage (15 s, renouvelé) + garde dans l'onglet.
 * Et si malgré tout une vente partait deux fois, la clé d'idempotence fait que
 * le serveur renvoie la vente existante au lieu d'en créer une seconde.
 */

export type SyncReport = {
  sent: { sale: OfflineSale; orderNumber: string | null; replayed: boolean; warnings: string[] }[]
  rejected: OfflineSale[]
  /** Raison de l'arrêt (réseau, session…) ; absent si la file a été vidée. */
  stopped?: string
  /** Un autre onglet synchronise déjà. */
  busy?: boolean
}

const LOCK_NAME = 'bstock-offline-sync'
const LEASE_KEY = 'bstock.offline.sync-lease'
const LEASE_MS = 15_000
const REQUEST_TIMEOUT_MS = 25_000
const MAX_PER_RUN = 200
const MAX_SERVER_ERRORS = 5

let runningInTab = false

function endpointOf(sale: OfflineSale): string {
  return sale.kind === 'pos' ? '/api/pos/offline-sales' : '/api/sales'
}

async function send(sale: OfflineSale): Promise<{ status: number; body: any }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(endpointOf(sale), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(sale.payload),
      signal: controller.signal,
    })
    const body = await res.json().catch(() => null)
    return { status: res.status, body }
  } catch {
    // Coupure ou délai dépassé : la vente a PEUT-ÊTRE été créée ; le renvoi (même clé) le dira
    return { status: 0, body: null }
  } finally {
    clearTimeout(timer)
  }
}

async function runQueue(owner: string): Promise<SyncReport> {
  const report: SyncReport = { sent: [], rejected: [] }

  // La session du navigateur doit être celle du compte qui a saisi les ventes
  const session = await probeSession()
  if (session === undefined) return { ...report, stopped: 'Réseau indisponible' }
  if (session === null || ownerKey(session) !== owner) {
    return { ...report, stopped: 'Reconnectez-vous avec le compte qui a saisi les ventes pour les envoyer.' }
  }

  for (let i = 0; i < MAX_PER_RUN; i++) {
    const sale = nextPending(await readQueue(), owner)
    if (!sale) break
    const { status, body } = await send(sale)
    const outcome = classifyResponse(status, body)

    if (outcome.type === 'sent') {
      reportNetworkSuccess()
      await updateQueue((q) => markSent(q, sale.id))
      const data = body?.data ?? {}
      report.sent.push({
        sale,
        orderNumber: (data.orderNumber ?? data.order_number ?? null) as string | null,
        replayed: Boolean(body?.replayed),
        warnings: Array.isArray(body?.warnings) ? body.warnings : [],
      })
      continue
    }
    if (outcome.type === 'reject') {
      reportNetworkSuccess()
      await updateQueue((q) => markRejected(q, sale.id, outcome))
      report.rejected.push({ ...sale, status: 'rejected', rejection: { code: outcome.code, message: outcome.message, status: outcome.status, at: new Date().toISOString() } })
      continue
    }
    // Erreur serveur répétée : on ne bloque pas toute la file derrière cette vente
    if (outcome.type === 'retry' && status >= 500 && (sale.serverErrors ?? 0) + 1 >= MAX_SERVER_ERRORS) {
      const rejection = { code: 'SERVER_ERROR', message: `Le serveur refuse cette vente (${outcome.message}).`, status }
      await updateQueue((q) => markRejected(q, sale.id, rejection))
      report.rejected.push({ ...sale, status: 'rejected', rejection: { ...rejection, at: new Date().toISOString() } })
      continue
    }
    await updateQueue((q) => markAttemptFailed(q, sale.id, outcome.message, { serverError: status >= 500 }))
    if (outcome.type === 'retry' && status === 0) reportNetworkFailure()
    report.stopped = outcome.message
    break
  }
  return report
}

function takeLease(): boolean {
  try {
    const now = Date.now()
    const current = Number(localStorage.getItem(LEASE_KEY) || 0)
    if (current > now) return false
    localStorage.setItem(LEASE_KEY, String(now + LEASE_MS))
    return true
  } catch {
    return true
  }
}

function releaseLease() {
  try {
    localStorage.removeItem(LEASE_KEY)
  } catch {
    /* ignore */
  }
}

export async function syncOfflineSales(owner: string): Promise<SyncReport> {
  if (runningInTab) return { sent: [], rejected: [], busy: true }
  runningInTab = true
  try {
    const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined
    if (locks?.request) {
      const result = await locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
        if (!lock) return null
        return runQueue(owner)
      })
      return result ?? { sent: [], rejected: [], busy: true }
    }
    if (!takeLease()) return { sent: [], rejected: [], busy: true }
    const renew = setInterval(() => {
      try {
        localStorage.setItem(LEASE_KEY, String(Date.now() + LEASE_MS))
      } catch {
        /* ignore */
      }
    }, LEASE_MS / 3)
    try {
      return await runQueue(owner)
    } finally {
      clearInterval(renew)
      releaseLease()
    }
  } finally {
    runningInTab = false
  }
}
