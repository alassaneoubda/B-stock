'use client'

import { useEffect } from 'react'

/**
 * Enregistre le service worker en production uniquement.
 * En développement (Turbopack/HMR), un SW actif perturbe le rechargement à chaud,
 * on le saute donc volontairement.
 */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
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
