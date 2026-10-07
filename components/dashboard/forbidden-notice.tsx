'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

/** Affiche un message quand le garde serveur a refusé l'accès à une page (?forbidden=1). */
export function ForbiddenNotice() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (params.get('forbidden') !== '1') return
    toast.error('Accès refusé', {
      description: "Votre rôle ne permet pas d'ouvrir cette page. Contactez le responsable du compte.",
    })
    router.replace(pathname)
  }, [params, pathname, router])

  return null
}
