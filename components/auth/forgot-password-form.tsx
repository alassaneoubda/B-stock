'use client'

import { useState, type FormEvent } from 'react'
import { AlertCircle, CheckCircle2, Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NETWORK_ERROR, httpErrorMessage } from '@/components/auth/auth-errors'

/** Demande d'un lien de réinitialisation : confirmation toujours générique. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentMessage, setSentMessage] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading) return
    setError(null)
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Adresse email invalide')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(httpErrorMessage(res, data))
      } else {
        setSentMessage(data.message || 'Si un compte actif correspond à cette adresse, un lien vient d’y être envoyé.')
      }
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setLoading(false)
    }
  }

  if (sentMessage) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-success/20 bg-success-soft p-4 text-sm text-success">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="space-y-2">
          <p className="font-medium">Demande enregistrée</p>
          <p className="leading-relaxed text-foreground">{sentMessage}</p>
          <button
            type="button"
            onClick={() => {
              setSentMessage(null)
              setEmail('')
            }}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            Utiliser une autre adresse
          </button>
        </div>
      </div>
    )
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
        <Label htmlFor="forgot-email">Email du compte</Label>
        <Input
          id="forgot-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="nom@entreprise.com"
          className="h-11"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          required
        />
      </div>
      <Button type="submit" className="h-11 w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Envoi…
          </>
        ) : (
          <>
            <Mail className="h-4 w-4" aria-hidden="true" /> Recevoir le lien
          </>
        )}
      </Button>
    </form>
  )
}
