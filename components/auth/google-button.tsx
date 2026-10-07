'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}

export function GoogleButton({
  label = 'Continuer avec Google',
  callbackUrl = '/dashboard',
}: {
  label?: string
  callbackUrl?: string
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Retour arrière depuis Google (cache bfcache) : on réactive le bouton
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setIsLoading(false)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  async function handleClick() {
    if (isLoading) return
    setIsLoading(true)
    setError(null)
    try {
      // Redirige vers Google ; au retour, l'utilisateur arrive sur callbackUrl.
      // Les refus côté serveur reviennent sur /login?error=… (affichés par la page).
      await signIn('google', { callbackUrl })
    } catch {
      setError('Impossible de lancer la connexion Google. Vérifiez votre réseau et réessayez.')
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={isLoading}
        className="h-11 w-full"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Redirection vers Google…
          </>
        ) : (
          <>
            <GoogleIcon className="h-4 w-4" />
            {label}
          </>
        )}
      </Button>
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
