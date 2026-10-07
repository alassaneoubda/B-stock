'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { safeCallbackUrl } from '@/lib/safe-redirect'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BrandMonogram } from '@/components/brand-mark'
import { Loader2, ShieldCheck, ArrowRight, Eye, EyeOff, KeyRound } from 'lucide-react'
import { NETWORK_ERROR, credentialsErrorMessage } from '@/components/auth/auth-errors'

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
  // Étape 2 : code de l'application d'authentification (si la 2FA est active)
  const [otpStep, setOtpStep] = useState(false)
  const [otp, setOtp] = useState('')
  const otpRef = useRef<HTMLInputElement>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (otpStep) otpRef.current?.focus()
  }, [otpStep])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    const code = otp.replace(/\s/g, '')
    if (otpStep && !/^\d{6}$/.test(code)) {
      setError('Le code doit comporter 6 chiffres.')
      return
    }
    submittingRef.current = true
    setIsLoading(true)
    setError(null)
    let redirecting = false
    try {
      const res = await signIn('credentials', {
        email,
        password,
        ...(otpStep ? { otp: code } : {}),
        redirect: false,
      })
      if (res?.error) {
        if (res.code === 'otp_required') {
          setOtpStep(true)
          setOtp('')
        } else if (res.code === 'otp_invalid') {
          setOtp('')
          setError(credentialsErrorMessage(res.error, res.code))
          otpRef.current?.focus()
        } else {
          setError(
            res.code === 'rate_limited'
              ? credentialsErrorMessage(res.error, res.code)
              : res.error === 'Configuration'
                ? // Exception côté serveur (base injoignable, migration manquante…), pas un mauvais mot de passe
                  'Erreur serveur pendant la connexion. Vérifiez que les migrations sont appliquées et consultez les journaux du serveur.'
                : 'Identifiants invalides ou compte non autorisé'
          )
          if (otpStep) {
            setOtpStep(false)
            setOtp('')
          }
        }
      } else {
        // Navigation complète : le cookie Auth.js doit être renvoyé au middleware
        redirecting = true
        window.location.assign(callbackUrl)
      }
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      if (!redirecting) {
        submittingRef.current = false
        setIsLoading(false)
      }
    }
  }

  function backToCredentials() {
    setOtpStep(false)
    setOtp('')
    setPassword('')
    setError(null)
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

            {otpStep ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg bg-muted p-3 text-sm">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <p className="text-muted-foreground">
                    Double authentification activée pour <span className="font-medium text-foreground">{email}</span>.
                    Saisissez le code à 6 chiffres affiché dans votre application d’authentification.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="otp">Code de vérification</Label>
                  <Input
                    ref={otpRef}
                    id="otp"
                    name="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={7}
                    placeholder="123456"
                    className="tabular h-11 text-center text-lg tracking-[0.3em]"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/[^\d ]/g, ''))}
                    disabled={isLoading}
                    aria-describedby="otp-help"
                  />
                  <p id="otp-help" className="text-xs text-muted-foreground">
                    Le code change toutes les 30 secondes.
                  </p>
                </div>
              </div>
            ) : (
              <>
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

              </>
            )}

            <Button type="submit" className="h-11 w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Connexion…
                </>
              ) : (
                <>
                  {otpStep ? 'Vérifier le code' : 'Se connecter'}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>

            {otpStep && (
              <Button type="button" variant="ghost" className="w-full" onClick={backToCredentials} disabled={isLoading}>
                Utiliser un autre compte
              </Button>
            )}
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
