'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GoogleButton } from '@/components/auth/google-button'
import { AuthDivider, AuthHeading, AuthSplitLayout } from '@/components/auth/auth-split-layout'
import { NETWORK_ERROR, httpErrorMessage, readJson } from '@/components/auth/auth-errors'
import { passwordPolicyError } from '@/lib/permissions'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'

const registerSchema = z
  .object({
    companyName: z.string().min(2, 'Le nom de l’entreprise doit contenir au moins 2 caractères'),
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

type RegisterForm = z.infer<typeof registerSchema>

export default function RegisterPage() {
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
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  })

  async function onSubmit(data: RegisterForm) {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsLoading(true)
    setError(null)

    let redirecting = false

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

      redirecting = true
      router.push('/login?registered=true')
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
      headline="Lancez votre dépôt sur B-Stock en quelques minutes."
      subline="Essai gratuit, sans carte bancaire. Stock, ventes et tournées au même endroit."
      formMaxWidth="max-w-[480px]"
      footer={
        <>
          Déjà un compte ?{' '}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Se connecter
          </Link>
        </>
      }
    >
      <AuthHeading title="Créer un compte" description="Quelques informations pour ouvrir l’espace de votre entreprise." />

      <GoogleButton label="S’inscrire avec Google" callbackUrl="/dashboard" />

      <AuthDivider />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="companyName">Nom de l’entreprise</Label>
            <Input
              id="companyName"
              autoComplete="organization"
              placeholder="Ets. Boissons"
              className="h-11"
              aria-invalid={errors.companyName ? true : undefined}
              aria-describedby={errors.companyName ? 'companyName-error' : undefined}
              {...register('companyName')}
              disabled={isLoading}
            />
            {errors.companyName && (
              <p id="companyName-error" className="text-xs text-destructive">
                {errors.companyName.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">Nom complet</Label>
            <Input
              id="fullName"
              autoComplete="name"
              placeholder="Jean Kouassi"
              className="h-11"
              aria-invalid={errors.fullName ? true : undefined}
              aria-describedby={errors.fullName ? 'fullName-error' : undefined}
              {...register('fullName')}
              disabled={isLoading}
            />
            {errors.fullName && (
              <p id="fullName-error" className="text-xs text-destructive">
                {errors.fullName.message}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            {errors.email && (
              <p id="email-error" className="text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Téléphone</Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+225 07…"
              className="h-11"
              {...register('phone')}
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="8 caractères min."
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
            {errors.password && (
              <p id="password-error" className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmation</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              className="h-11"
              aria-invalid={errors.confirmPassword ? true : undefined}
              aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
              {...register('confirmPassword')}
              disabled={isLoading}
            />
            {errors.confirmPassword && (
              <p id="confirmPassword-error" className="text-xs text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>
        </div>

        <Button type="submit" className="mt-2 h-11 w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Création du compte…
            </>
          ) : (
            'Créer mon compte'
          )}
        </Button>
      </form>
    </AuthSplitLayout>
  )
}
