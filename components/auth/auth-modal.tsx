'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react'
import { useRouter } from 'next/navigation'
import { SessionProvider, signIn } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { GoogleButton } from '@/components/auth/google-button'
import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  const [render, setRender] = useState(false)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setRender(true)
      const raf = requestAnimationFrame(() => setShow(true))
      return () => cancelAnimationFrame(raf)
    }
    setShow(false)
    const t = setTimeout(() => setRender(false), 320)
    return () => clearTimeout(t)
  }, [isOpen])

  // Lock body scroll + close on Escape
  useEffect(() => {
    if (!render) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [render, onClose])

  if (!render) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-3 sm:p-6">
      {/* Overlay */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: show ? 1 : 0 }}
      />

      {/* Panel — descend depuis le haut */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md my-4 sm:my-12"
        style={{
          opacity: show ? 1 : 0,
          transform: show ? 'translateY(0) scale(1)' : 'translateY(-56px) scale(0.97)',
          transition:
            'transform 320ms cubic-bezier(0.16, 1, 0.3, 1), opacity 280ms ease-out',
        }}
      >
        <div className="rounded-2xl bg-white shadow-2xl shadow-zinc-900/20 border border-zinc-200/80 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-3">
            <div className="flex items-center gap-2.5">
              <BrandLogo href={false} height={88} />
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
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
      </div>
    </div>
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

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(data: LoginValues) {
    setIsLoading(true)
    setError(null)
    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      })
      if (result?.error) {
        setError('Email ou mot de passe incorrect')
      } else {
        onClose()
        router.push('/dashboard')
        router.refresh()
      }
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
    } finally {
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
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 font-medium">
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
          <Label htmlFor="login-password" className="text-sm font-medium text-zinc-700">
            Mot de passe
          </Label>
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
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span className="flex items-center justify-center gap-2">
              Se connecter <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-zinc-500">
        Pas encore de compte ?{' '}
        <button onClick={onSwitch} className="font-medium text-zinc-950 hover:underline">
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
    password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
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
  const switchRef = useRef(onSwitch)
  switchRef.current = onSwitch

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) })

  async function onSubmit(data: RegisterValues) {
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
      const result = await response.json()
      if (!response.ok) {
        setError(result.error || 'Une erreur est survenue')
        return
      }
      setSuccess(true)
      setTimeout(() => switchRef.current(), 1600)
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="py-8 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <Check className="h-6 w-6 text-green-600" />
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
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 font-medium">
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
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Créer mon compte'}
        </Button>
      </form>

      <p className="text-center text-sm text-zinc-500">
        Déjà un compte ?{' '}
        <button onClick={onSwitch} className="font-medium text-zinc-950 hover:underline">
          Se connecter
        </button>
      </p>
    </div>
  )
}
