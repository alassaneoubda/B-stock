'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Eye, EyeOff, Check } from 'lucide-react'

const registerSchema = z.object({
  companyName: z.string().min(2, 'Le nom de l\'entreprise doit contenir au moins 2 caractères'),
  fullName: z.string().min(2, 'Le nom complet doit contenir au moins 2 caractères'),
  email: z.string().email('Email invalide'),
  phone: z.string().optional(),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword'],
})

type RegisterForm = z.infer<typeof registerSchema>

const benefits = [
  '30 jours d\'essai gratuit',
  'Aucune carte bancaire requise',
  'Configuration en 5 minutes',
  'Support inclus',
]

export default function RegisterPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  })

  async function onSubmit(data: RegisterForm) {
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

      router.push('/login?registered=true')
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left side — Form */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 bg-white">
        <div className="w-full max-w-[480px] space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-4">
            <div className="h-8 w-8 rounded-lg bg-zinc-950 flex items-center justify-center">
              <span className="text-white text-sm font-bold">B</span>
            </div>
            <span className="text-lg font-bold text-zinc-950">B-Stock</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-zinc-950 mb-1">Créer un compte</h1>
            <p className="text-sm text-zinc-500">
              Lancez votre dépôt sur B-Stock en quelques minutes
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 font-medium animate-in fade-in slide-in-from-top-2">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="companyName" className="text-sm font-medium text-zinc-700">Nom de l&apos;entreprise</Label>
                <Input
                  id="companyName"
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
                <Label htmlFor="fullName" className="text-sm font-medium text-zinc-700">Nom complet</Label>
                <Input
                  id="fullName"
                  placeholder="Jean Kouassi"
                  className="h-10"
                  {...register('fullName')}
                  disabled={isLoading}
                />
                {errors.fullName && (
                  <p className="text-xs text-red-500">{errors.fullName.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium text-zinc-700">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nom@entreprise.com"
                  className="h-10"
                  {...register('email')}
                  disabled={isLoading}
                />
                {errors.email && (
                  <p className="text-xs text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-sm font-medium text-zinc-700">Téléphone</Label>
                <Input
                  id="phone"
                  placeholder="+225 07..."
                  className="h-10"
                  {...register('phone')}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium text-zinc-700">Mot de passe</Label>
                <div className="relative">
                  <Input
                    id="password"
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
                {errors.password && (
                  <p className="text-xs text-red-500">{errors.password.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-zinc-700">Confirmation</Label>
                <Input
                  id="confirmPassword"
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
              className="w-full h-10 bg-zinc-950 hover:bg-zinc-800 text-white text-sm font-semibold mt-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Créer mon compte'
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-zinc-500">
            Déjà un compte ?{' '}
            <Link href="/login" className="font-medium text-zinc-950 hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </div>

      {/* Right side — Benefits */}
      <div className="hidden lg:flex lg:w-[40%] bg-zinc-950 flex-col justify-between p-12 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-[20%] right-[-10%] w-[50%] h-[50%] bg-blue-600 rounded-full blur-[100px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-400 rounded-full blur-[80px]" />
        </div>

        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center">
              <span className="text-white text-sm font-bold">B</span>
            </div>
            <span className="text-xl font-bold">B-Stock</span>
          </Link>
        </div>

        <div className="relative z-10">
          <h2 className="text-3xl font-bold leading-tight tracking-tight mb-8">
            Pourquoi B-Stock ?
          </h2>

          <div className="space-y-5">
            {benefits.map((benefit, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400">
                  <Check className="h-3.5 w-3.5" />
                </div>
                <span className="text-sm font-medium text-zinc-300">{benefit}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <div className="p-6 rounded-xl bg-white/5 border border-white/10">
            <p className="text-sm italic text-zinc-400 leading-relaxed mb-4">
              &ldquo;B-Stock a transformé notre gestion quotidienne. Nos stocks sont précis et nos clients sont servis plus vite.&rdquo;
            </p>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-sm font-bold">M</div>
              <div>
                <p className="text-sm font-semibold text-white">Moussa Diakité</p>
                <p className="text-xs text-zinc-500">Dépôt Plateau</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
