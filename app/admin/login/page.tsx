'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { safeCallbackUrl } from '@/lib/safe-redirect'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BrandMonogram } from '@/components/brand-mark'
import { Loader2, ShieldCheck, ArrowRight, Eye, EyeOff } from 'lucide-react'

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Chargement" />
        </div>
      }
    >
      <AdminLoginContent />
    </Suspense>
  )
}

function AdminLoginContent() {
  const searchParams = useSearchParams()
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'), '/admin')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    try {
      const res = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })
      if (res?.error) {
        setError('Identifiants invalides ou compte non autorisé')
      } else {
        // Navigation complète : le cookie Auth.js doit être renvoyé au middleware
        window.location.assign(callbackUrl)
      }
    } catch {
      setError('Une erreur est survenue. Réessayez.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[400px] space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMonogram size={44} />
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Administration B-Stock</h1>
            <p className="text-sm text-muted-foreground">Accès réservé aux opérateurs de la plateforme</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-[0_1px_2px_0_rgb(15_23_42/0.04)] sm:p-8">
          <form onSubmit={onSubmit} className="space-y-5">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm font-medium text-destructive"
              >
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="ops@bstock.ci"
                className="h-11"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-11 pr-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="h-11 w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Connexion…
                </>
              ) : (
                <>
                  Se connecter
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </form>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Connexion sécurisée, actions journalisées
        </p>
      </div>
    </div>
  )
}
