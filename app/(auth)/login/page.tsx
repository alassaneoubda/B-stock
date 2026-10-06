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
import { AuthSplitLayout } from '@/components/auth/auth-split-layout'
import { NETWORK_ERROR, credentialsErrorMessage } from '@/components/auth/auth-errors'
import { Loader2, Eye, EyeOff, ArrowRight } from 'lucide-react'

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
        <div className="flex min-h-screen items-center justify-center bg-[#F7F4EF]">
          <Loader2 className="h-6 w-6 animate-spin text-[#F58233]" />
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
      imageAlt="Dépôt de boissons B-STOCK"
      headline="Gérez votre dépôt comme un vrai métier."
      subline="Stock, ventes, tournées et consignes — une seule application pour les distributeurs en Côte d’Ivoire."
      imageSide="left"
    >
      <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">Connexion</h1>
      <p className="mt-1 text-sm text-[#64748B]">Accédez à votre tableau de bord</p>

      {registered && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
          Compte créé. Connectez-vous pour continuer.
        </div>
      )}

      <div className="mt-6">
        <GoogleButton label="Continuer avec Google" callbackUrl={callbackUrl} />
      </div>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-[#E7E0D6]" />
        <span className="text-xs text-[#94A3B8]">ou avec votre email</span>
        <div className="h-px flex-1 bg-[#E7E0D6]" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-sm font-medium text-[#334155]">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="nom@entreprise.com"
            className="h-11 rounded-xl border-[#E7E0D6] bg-[#FBF9F6]"
            {...register('email')}
            disabled={isLoading}
          />
          {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-medium text-[#334155]">
              Mot de passe
            </Label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-[#EA580C] hover:text-[#C2410C]"
            >
              Mot de passe oublié ?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              className="h-11 rounded-xl border-[#E7E0D6] bg-[#FBF9F6] pr-10"
              {...register('password')}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#475569]"
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
        </div>

        <Button
          type="submit"
          className="mt-2 h-11 w-full rounded-full bg-[#F58233] text-sm font-semibold text-white hover:bg-[#E06B1A]"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span className="flex items-center justify-center gap-2">
              Se connecter <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[#64748B]">
        Pas encore de compte ?{' '}
        <Link href="/register" className="font-semibold text-[#0F172A] hover:underline">
          Créer un compte
        </Link>
      </p>
    </AuthSplitLayout>
  )
}
