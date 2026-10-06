'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { SessionProvider, signIn } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { GoogleButton } from '@/components/auth/google-button'
import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog'
import {
  NETWORK_ERROR,
  credentialsErrorMessage,
  httpErrorMessage,
  readJson,
} from '@/components/auth/auth-errors'
import { passwordPolicyError } from '@/lib/permissions'
import { Loader2, Eye, EyeOff, ArrowRight, X, Check } from 'lucide-react'

type Mode = 'login' | 'register'

type AuthModalContextValue = {
  open: (mode?: Mode) => void
  close: () => void
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null)

export function useAuthModal() {
  const ctx = useContext(AuthModalContext)
  if (!ctx) throw new Error('useAuthModal doit être utilisé dans <AuthModalProvider>')
  return ctx
}

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('login')

  const open = useCallback((m: Mode = 'login') => {
    setMode(m)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => setIsOpen(false), [])

  return (
    <SessionProvider>
      <AuthModalContext.Provider value={{ open, close }}>
        {children}
        <AuthModal isOpen={isOpen} mode={mode} setMode={setMode} onClose={close} />
      </AuthModalContext.Provider>
    </SessionProvider>
  )
}

/* ------------------------------------------------------------------ */
/* Modal shell with descending animation                               */
/* Basée sur le Dialog Radix (shadcn) : Échap, piège du focus, blocage */
/* du défilement et restauration du focus à la fermeture.              */
/* ------------------------------------------------------------------ */

function AuthModal({
  isOpen,
  mode,
  setMode,
  onClose,
}: {
  isOpen: boolean
  mode: Mode
  setMode: (m: Mode) => void
  onClose: () => void
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <DialogPortal>
        {/* L'overlay sert aussi de conteneur défilant (formulaire long sur mobile) ;
            un clic en dehors du panneau ferme la modale. */}
        <DialogOverlay className="z-[100] flex items-start justify-center overflow-y-auto bg-zinc-950/50 p-3 backdrop-blur-sm duration-300 sm:p-6">
          {/* Panel — descend depuis le haut */}
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="relative z-10 my-4 w-full max-w-md outline-none duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-top-14 data-[state=closed]:slide-out-to-top-14 data-[state=open]:zoom-in-97 data-[state=closed]:zoom-out-97 sm:my-12"
          >
            <DialogTitle className="sr-only">
              {mode === 'login' ? 'Connexion' : 'Créer un compte'}
            </DialogTitle>
            <div className="rounded-2xl bg-white shadow-2xl shadow-zinc-900/20 border border-zinc-200/80 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-3">
                <div className="flex items-center gap-2.5">
                  <BrandLogo href={false} height={88} />
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
                  aria-label="Fermer"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="px-5 sm:px-6 pb-6">
                {mode === 'login' ? (
                  <LoginForm onSwitch={() => setMode('register')} onClose={onClose} />
                ) : (
                  <RegisterForm onSwitch={() => setMode('login')} />
                )}
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})
type LoginValues = z.infer<typeof loginSchema>

function LoginForm({ onSwitch, onClose }: { onSwitch: () => void; onClose: () => void }) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Verrou synchrone : empêche une double soumission avant le re-rendu
  const submittingRef = useRef(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(data: LoginValues) {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsLoading(true)
    setError(null)
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
        onClose()
        router.push('/dashboard')
        router.refresh()
      }
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      submittingRef.current = false
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-zinc-950">Connexion</h2>
        <p className="text-sm text-zinc-500">Accédez à votre tableau de bord</p>
      </div>

      <GoogleButton label="Se connecter avec Google" callbackUrl="/dashboard" />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-zinc-200" />
        <span className="text-xs text-zinc-400">ou avec votre email</span>
        <div className="h-px flex-1 bg-zinc-200" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 font-medium"
          >
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="login-email" className="text-sm font-medium text-zinc-700">
            Email
          </Label>
          <Input
            id="login-email"
            type="email"
            placeholder="nom@entreprise.com"
            className="h-10"
            {...register('email')}
            disabled={isLoading}
          />
          {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password" className="text-sm font-medium text-zinc-700">
              Mot de passe
            </Label>
            <Link
              href="/forgot-password"
              onClick={onClose}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-950 hover:underline"
            >
              Mot de passe oublié ?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              className="h-10 pr-10"
              {...register('password')}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors"
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
        </div>

        <Button
          type="submit"
          className="w-full h-10 bg-zinc-950 hover:bg-zinc-800 text-white text-sm font-semibold"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-label="Connexion en cours…" />
          ) : (
            <span className="flex items-center justify-center gap-2">
              Se connecter <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-zinc-500">
        Pas encore de compte ?{' '}
        <button
          type="button"
          onClick={onSwitch}
          className="font-medium text-zinc-950 hover:underline"
        >
          Créer un compte
        </button>
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Register                                                            */
/* ------------------------------------------------------------------ */

const registerSchema = z
  .object({
    companyName: z.string().min(2, "Le nom de l'entreprise doit contenir au moins 2 caractères"),
    fullName: z.string().min(2, 'Le nom complet doit contenir au moins 2 caractères'),
    email: z.string().email('Email invalide'),
    phone: z.string().optional(),
    // Mêmes règles que le serveur (lib/permissions)
    password: z.string().superRefine((value, ctx) => {
      const policyError = passwordPolicyError(value)
      if (policyError) ctx.addIssue({ code: z.ZodIssueCode.custom, message: policyError })
    }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })
type RegisterValues = z.infer<typeof registerSchema>

function RegisterForm({ onSwitch }: { onSwitch: () => void }) {
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  // Verrou synchrone : empêche une double soumission avant le re-rendu
  const submittingRef = useRef(false)
  const switchRef = useRef(onSwitch)
  switchRef.current = onSwitch

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) })

  async function onSubmit(data: RegisterValues) {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: data.companyName,
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
          password: data.password,
        }),
      })
      const result = await readJson(response)
      if (!response.ok) {
        // Message précis du serveur (email déjà utilisé, inscriptions fermées, 429…)
        setError(httpErrorMessage(response, result))
        return
      }
      setSuccess(true)
      setTimeout(() => switchRef.current(), 1600)
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      submittingRef.current = false
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div role="status" className="py-8 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <Check className="h-6 w-6 text-green-600" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-zinc-950">Compte créé !</h2>
        <p className="text-sm text-zinc-500">Vous pouvez maintenant vous connecter.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-zinc-950">Créer un compte</h2>
        <p className="text-sm text-zinc-500">Lancez votre dépôt en quelques minutes</p>
      </div>

      <GoogleButton label="S'inscrire avec Google" callbackUrl="/dashboard" />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-zinc-200" />
        <span className="text-xs text-zinc-400">ou avec votre email</span>
        <div className="h-px flex-1 bg-zinc-200" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 font-medium"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="reg-company" className="text-sm font-medium text-zinc-700">
              Entreprise
            </Label>
            <Input
              id="reg-company"
              placeholder="Ets. Boissons"
              className="h-10"
              {...register('companyName')}
              disabled={isLoading}
            />
            {errors.companyName && (
              <p className="text-xs text-red-500">{errors.companyName.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-name" className="text-sm font-medium text-zinc-700">
              Nom complet
            </Label>
            <Input
              id="reg-name"
              placeholder="Jean Kouassi"
              className="h-10"
              {...register('fullName')}
              disabled={isLoading}
            />
            {errors.fullName && <p className="text-xs text-red-500">{errors.fullName.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="reg-email" className="text-sm font-medium text-zinc-700">
              Email
            </Label>
            <Input
              id="reg-email"
              type="email"
              placeholder="nom@entreprise.com"
              className="h-10"
              {...register('email')}
              disabled={isLoading}
            />
            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-phone" className="text-sm font-medium text-zinc-700">
              Téléphone
            </Label>
            <Input
              id="reg-phone"
              placeholder="+225 07..."
              className="h-10"
              {...register('phone')}
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="reg-password" className="text-sm font-medium text-zinc-700">
              Mot de passe
            </Label>
            <div className="relative">
              <Input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="8 caractères min."
                className="h-10 pr-10"
                {...register('password')}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-confirm" className="text-sm font-medium text-zinc-700">
              Confirmation
            </Label>
            <Input
              id="reg-confirm"
              type="password"
              placeholder="••••••••"
              className="h-10"
              {...register('confirmPassword')}
              disabled={isLoading}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>
            )}
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-10 bg-zinc-950 hover:bg-zinc-800 text-white text-sm font-semibold"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-label="Création du compte…" />
          ) : (
            'Créer mon compte'
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-zinc-500">
        Déjà un compte ?{' '}
        <button
          type="button"
          onClick={onSwitch}
          className="font-medium text-zinc-950 hover:underline"
        >
          Se connecter
        </button>
      </p>
    </div>
  )
}
