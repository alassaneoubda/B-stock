'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import {
  discardSale,
  enqueue as enqueueSale,
  ownedBy,
  pendingSales,
  rejectedSales,
  retrySale,
  type OfflineSale,
} from '@/lib/offline/queue'
import { isOffline, probeSession, subscribeNetwork } from '@/lib/offline/network'
import { onOfflineChange, readQueue, updateQueue } from '@/lib/offline/store'
import { syncOfflineSales } from '@/lib/offline/sync'

const RETRY_INTERVAL_MS = 30_000
const PROBE_INTERVAL_MS = 20_000

/** true quand le réseau est indisponible (navigateur hors ligne ou dernier appel API en échec réseau). */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribeNetwork, isOffline, () => false)
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n > 1 ? many : one}`
}

/**
 * File des ventes hors ligne du compte connecté : compteur, envoi automatique au
 * retour du réseau (événement `online` + essai périodique), envoi manuel.
 */
export function useOfflineSales(owner: string | null) {
  const offline = useOffline()
  const [queue, setQueue] = useState<OfflineSale[]>([])
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)

  const reload = useCallback(async () => {
    const all = await readQueue().catch(() => [])
    setQueue(ownedBy(all, owner))
  }, [owner])

  useEffect(() => {
    void reload()
    return onOfflineChange(() => void reload())
  }, [reload])

  const syncNow = useCallback(
    async (manual = false) => {
      if (!owner || syncingRef.current) return
      syncingRef.current = true
      setSyncing(true)
      try {
        const report = await syncOfflineSales(owner)
        if (report.sent.length > 0) {
          toast.success(`${plural(report.sent.length, 'vente hors ligne envoyée', 'ventes hors ligne envoyées')}`, {
            description: report.sent
              .map((s) => s.orderNumber)
              .filter(Boolean)
              .join(', '),
          })
          for (const s of report.sent) for (const w of s.warnings) toast.warning(w, { duration: 10_000 })
        }
        if (report.rejected.length > 0) {
          toast.error(`${plural(report.rejected.length, 'vente refusée par le serveur', 'ventes refusées par le serveur')}`, {
            description: 'Ouvrez « Ventes à vérifier » pour la corriger ou l’abandonner.',
            duration: 10_000,
          })
        }
        if (manual && report.busy) toast.info('Envoi déjà en cours (autre onglet)')
        else if (manual && report.stopped) toast.error('Envoi interrompu', { description: report.stopped })
      } finally {
        syncingRef.current = false
        setSyncing(false)
        void reload()
      }
    },
    [owner, reload]
  )

  const pending = owner ? pendingSales(queue, owner) : []
  const rejected = owner ? rejectedSales(queue, owner) : []
  const pendingCount = pending.length

  // Retour du réseau : envoi automatique
  useEffect(() => {
    if (!offline && pendingCount > 0) void syncNow(false)
  }, [offline, pendingCount, syncNow])

  // Essai périodique (le navigateur ne signale pas toujours le retour du réseau)
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      if (pendingCount > 0) void syncNow(false)
      else if (isOffline()) void probeSession()
    }, pendingCount > 0 ? RETRY_INTERVAL_MS : PROBE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [pendingCount, syncNow])

  const enqueue = useCallback(
    async (sale: OfflineSale) => {
      await updateQueue((q) => enqueueSale(q, sale))
      await reload()
      if (!isOffline()) void syncNow(false)
    },
    [reload, syncNow]
  )

  const retry = useCallback(
    async (id: string, patch?: Partial<Pick<OfflineSale, 'payload' | 'summary'>>) => {
      await updateQueue((q) => retrySale(q, id, patch))
      await reload()
      if (!isOffline()) void syncNow(true)
    },
    [reload, syncNow]
  )

  const discard = useCallback(
    async (id: string) => {
      await updateQueue((q) => discardSale(q, id))
      await reload()
    },
    [reload]
  )

  return { offline, queue, pending, rejected, pendingCount, syncing, syncNow, enqueue, retry, discard }
}

export type OfflineSalesState = ReturnType<typeof useOfflineSales>
