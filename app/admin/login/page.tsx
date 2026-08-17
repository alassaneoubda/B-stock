'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, ShieldCheck, ArrowRight, Eye, EyeOff } from 'lucide-react'

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-950">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      }
    >
      <AdminLoginContent />
    </Suspense>
  )
}

function AdminLoginContent() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/admin'

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
        window.location.assign(callbackUrl.startsWith('/') ? callbackUrl : '/admin')
      }
    } catch {
      setError('Une erreur est survenue. Réessayez.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-6 py-12">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="h-10 w-10 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold leading-tight">B-Stock</p>
            <p className="text-xs text-zinc-500 leading-tight">Back office</p>
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Administration</h1>
          <p className="text-sm text-zinc-500">Accès réservé aux opérateurs plateforme</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400 font-medium">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium text-zinc-300">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="ops@bstock.ci"
              className="h-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-medium text-zinc-300">
              Mot de passe
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className="h-10 pr-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-10 bg-white hover:bg-zinc-200 text-zinc-950 text-sm font-semibold"
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
      </div>
    </div>
  )
}
