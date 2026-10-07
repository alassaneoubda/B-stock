'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/states'

// Erreur inattendue dans une page du dashboard : l'utilisateur garde le menu
// et peut réessayer, au lieu d'une page blanche ou de chiffres à 0 trompeurs.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard]', error)
  }, [error])

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <ErrorState
          title="Cette page n'a pas pu s'afficher"
          description="Un problème temporaire est survenu. Vos données ne sont pas perdues."
          onRetry={reset}
        />
        <div className="text-center">
          <Button variant="link" asChild>
            <Link href="/dashboard">Retour au tableau de bord</Link>
          </Button>
        </div>
        {error.digest && (
          <p className="text-center text-xs text-muted-foreground/70">Référence : {error.digest}</p>
        )}
      </div>
    </div>
  )
}
