'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { signIn, signOut } from 'next-auth/react'
import { safeCallbackUrl } from '@/lib/safe-redirect'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GoogleButton } from '@/components/auth/google-button'
import { AuthDivider, AuthHeading, AuthSplitLayout } from '@/components/auth/auth-split-layout'
import { NETWORK_ERROR, credentialsErrorMessage } from '@/components/auth/auth-errors'
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

type LoginForm = z.infer<typeof loginSchema>

const SESSION_ERRORS = new Set(['SessionExpired', 'CompanySuspended', 'AccountDisabled'])

function mapAuthError(code: string): string {
  switch (code) {
    case 'Configuration':
      return "Connexion Google indisponible : configuration OAuth invalide. Réessayez avec votre email ou contactez l'administrateur."
    case 'AccessDenied':
      return 'Accès refusé. Votre compte n’est pas autorisé.'
    case 'OAuthAccountNotLinked':
      return 'Cet email est déjà utilisé avec une autre méthode de connexion.'
    case 'OAuthSignin':
    case 'OAuthCallback':
      return 'Échec de la connexion Google. Veuillez réessayer.'
    case 'SessionExpired':
      return 'Votre session a expiré. Veuillez vous reconnecter.'
    case 'CompanySuspended':
      return 'Le compte de votre entreprise est suspendu. Contactez le support.'
    case 'AccountDisabled':
      return 'Votre compte a été désactivé. Contactez le responsable de votre entreprise.'
    case 'GoogleDisabled':
      return 'La connexion Google est momentanément désactivée. Utilisez votre email.'
    case 'RegistrationsClosed':
      return 'Les inscriptions sont momentanément fermées.'
    case 'UseAdminLogin':
      return 'Les administrateurs se connectent depuis l’espace administration.'
    default:
      return 'Une erreur est survenue lors de la connexion. Veuillez réessayer.'
  }
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background" aria-busy="true">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Chargement" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const searchParams = useSearchParams()
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'))
  const urlError = searchParams.get('error')

  // Session révoquée ou entreprise suspendue : on purge le cookie de session
  // pour que l'utilisateur puisse se reconnecter (sinon boucle de redirection).
  useEffect(() => {
    if (urlError && SESSION_ERRORS.has(urlError)) {
      signOut({ redirect: false }).catch(() => {})
    }
  }, [urlError])
  const registered = searchParams.get('registered') === 'true'
  const passwordReset = searchParams.get('reset') === 'success'
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(urlError ? mapAuthError(urlError) : null)
  // Verrou synchrone : empêche une double soumission avant le re-rendu
  const submittingRef = useRef(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginForm) {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsLoading(true)
    setError(null)

    let redirecting = false
    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      })

      if (result?.error) {
        setError(credentialsErrorMessage(result.error, result.code))
      } else if (result && !result.ok) {
        setError('Une erreur est survenue lors de la connexion. Veuillez réessayer.')
      } else {
        // On garde le bouton désactivé pendant la navigation
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

  return (
    <AuthSplitLayout
      imageSrc="/images/landing/landing-hero-depot.jpg"
      imageAlt="Dépôt de boissons B-Stock"
      headline="Gérez votre dépôt avec la rigueur d’un vrai métier."
      subline="Stock, ventes, tournées et consignes : une seule application pour les distributeurs et les maquis."
      footer={
        <>
          Pas encore de compte ?{' '}
          <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
            Créer un compte
          </Link>
        </>
      }
    >
      <AuthHeading title="Connexion" description="Accédez à votre espace B-Stock." />

      {registered && (
        <div role="status" className="mb-6 flex items-start gap-2.5 rounded-lg border border-success/20 bg-success-soft p-3 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Compte créé. Connectez-vous pour continuer.
        </div>
      )}

      {passwordReset && (
        <div role="status" className="mb-6 flex items-start gap-2.5 rounded-lg border border-success/20 bg-success-soft p-3 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.
        </div>
      )}

      <GoogleButton label="Continuer avec Google" callbackUrl={callbackUrl} />

      <AuthDivider />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="nom@entreprise.com"
            className="h-11"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
            disabled={isLoading}
          />
          {errors.email && <p id="email-error" className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Mot de passe</Label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Mot de passe oublié ?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              className="h-11 pr-11"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
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
          {errors.password && <p id="password-error" className="text-xs text-destructive">{errors.password.message}</p>}
        </div>

        <Button type="submit" className="mt-2 h-11 w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Connexion…
            </>
          ) : (
            <>
              Se connecter <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </Button>
      </form>
    </AuthSplitLayout>
  )
}
