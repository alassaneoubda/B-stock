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
import { GoogleButton } from '@/components/auth/google-button'
import { AuthSplitLayout } from '@/components/auth/auth-split-layout'
import { Loader2, Eye, EyeOff } from 'lucide-react'

const registerSchema = z
  .object({
    companyName: z.string().min(2, 'Le nom de l’entreprise doit contenir au moins 2 caractères'),
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

type RegisterForm = z.infer<typeof registerSchema>

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
    <AuthSplitLayout
      imageSrc="/images/landing/landing-livraison.jpg"
      imageAlt="Livraison de casiers de boissons"
      headline="Ouvrez votre dépôt en quelques minutes."
      subline="30 jours d’essai. Aucune carte. Stock, ventes et tournées au même endroit."
      imageSide="right"
      formMaxWidth="max-w-[480px]"
    >
      <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">Créer un compte</h1>
      <p className="mt-1 text-sm text-[#64748B]">Lancez votre dépôt B-STOCK</p>

      <div className="mt-6">
        <GoogleButton label="S’inscrire avec Google" callbackUrl="/dashboard" />
      </div>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-[#E7E0D6]" />
        <span className="text-xs text-[#94A3B8]">ou avec votre email</span>
        <div className="h-px flex-1 bg-[#E7E0D6]" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="companyName" className="text-sm font-medium text-[#334155]">
              Nom de l’entreprise
            </Label>
            <Input
              id="companyName"
              placeholder="Ets. Boissons"
              className="h-11 rounded-xl border-[#E7E0D6] bg-[#FBF9F6]"
              {...register('companyName')}
              disabled={isLoading}
            />
            {errors.companyName && (
              <p className="text-xs text-red-500">{errors.companyName.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fullName" className="text-sm font-medium text-[#334155]">
              Nom complet
            </Label>
            <Input
              id="fullName"
              placeholder="Jean Kouassi"
              className="h-11 rounded-xl border-[#E7E0D6] bg-[#FBF9F6]"
              {...register('fullName')}
              disabled={isLoading}
            />
            {errors.fullName && <p className="text-xs text-red-500">{errors.fullName.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <Label htmlFor="phone" className="text-sm font-medium text-[#334155]">
              Téléphone
            </Label>
            <Input
              id="phone"
              placeholder="+225 07..."
              className="h-11 rounded-xl border-[#E7E0D6] bg-[#FBF9F6]"
              {...register('phone')}
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-medium text-[#334155]">
              Mot de passe
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="8 caractères min."
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

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-sm font-medium text-[#334155]">
              Confirmation
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              className="h-11 rounded-xl border-[#E7E0D6] bg-[#FBF9F6]"
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
          className="mt-2 h-11 w-full rounded-full bg-[#F58233] text-sm font-semibold text-white hover:bg-[#E06B1A]"
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Créer mon compte'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[#64748B]">
        Déjà un compte ?{' '}
        <Link href="/login" className="font-semibold text-[#0F172A] hover:underline">
          Se connecter
        </Link>
      </p>
    </AuthSplitLayout>
  )
}
