'use client'

import { useEffect } from 'react'
import { probeSession } from '@/lib/offline/network'
import { ownerKey } from '@/lib/offline/queue'
import { clearCachedData, getMeta } from '@/lib/offline/store'

/**
 * Appareil partagé : les données de vente hors ligne (catalogue, prix, stock,
 * clients) ne doivent survivre ni à une déconnexion ni à un changement de compte.
 *
 * À chaque chargement de page, si un cache existe et que le serveur répond :
 * pas de session, ou session d'un autre compte → le cache est effacé.
 * Serveur injoignable → rien n'est touché (c'est justement le cas hors ligne).
 * La file des ventes en attente est conservée (voir lib/offline/store.ts).
 */
export function OfflineDataGuard() {
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const meta = await getMeta().catch(() => null)
      if (!meta || cancelled) return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      const user = await probeSession()
      if (user === undefined || cancelled) return
      if (ownerKey(user) !== meta.owner) await clearCachedData()
    })()
    return () => {
      cancelled = true
    }
  }, [])
  return null
}
