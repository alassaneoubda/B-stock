'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NETWORK_ERROR, httpErrorMessage } from '@/components/auth/auth-errors'
import { passwordPolicyError } from '@/lib/permissions'

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading) return
    setError(null)
    const policy = passwordPolicyError(password)
    if (policy) return setError(policy)
    if (password !== confirm) return setError('Les deux mots de passe ne correspondent pas')

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(httpErrorMessage(res, data))
        setLoading(false)
        return
      }
      router.replace('/login?reset=success')
    } catch {
      setError(NETWORK_ERROR)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="new-password">Nouveau mot de passe</Label>
        <div className="relative">
          <Input
            id="new-password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            className="h-11 pr-11"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="new-password-help"
            disabled={loading}
            required
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          >
            {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        <p id="new-password-help" className="text-xs text-muted-foreground">
          8 caractères minimum, avec au moins une lettre et un chiffre.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
        <Input
          id="confirm-password"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          className="h-11"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={loading}
          required
        />
      </div>
      <Button type="submit" className="h-11 w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Enregistrement…
          </>
        ) : (
          'Enregistrer le mot de passe'
        )}
      </Button>
    </form>
  )
}
