'use client'

import { useEffect } from 'react'

/**
 * Enregistre le service worker en production uniquement.
 * Force aussi la prise en compte de la nouvelle version (SKIP_WAITING).
 */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((reg) => {
          // Nouvelle version disponible → activer tout de suite
          if (reg.waiting) {
            reg.waiting.postMessage('SKIP_WAITING')
          }
          reg.addEventListener('updatefound', () => {
            const worker = reg.installing
            if (!worker) return
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                worker.postMessage('SKIP_WAITING')
              }
            })
          })
        })
        .catch(() => {
          /* échec silencieux : l'app fonctionne sans le SW */
        })
    }

    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register)
      return () => window.removeEventListener('load', register)
    }
  }, [])

  return null
}
