'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react'
import { NETWORK_ERROR, httpErrorMessage, readJson } from '@/components/auth/auth-errors'

const sectors = [
  { value: 'distributor', label: 'Distributeur' },
  { value: 'wholesaler', label: 'Grossiste' },
  { value: 'semi_wholesaler', label: 'Demi-grossiste' },
  { value: 'depot', label: 'Dépôt' },
]

export function OnboardingForm({ defaultName }: { defaultName?: string }) {
  const router = useRouter()
  const { update } = useSession()

  const [companyName, setCompanyName] = useState(defaultName ?? '')
  const [sector, setSector] = useState('')
  const [phone, setPhone] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Verrou synchrone : empêche une double soumission avant le re-rendu
  const submittingRef = useRef(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    if (companyName.trim().length < 2) {
      setError("Le nom de l'entreprise doit contenir au moins 2 caractères")
      return
    }
    submittingRef.current = true
    setIsLoading(true)
    setError(null)

    let redirecting = false
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: companyName.trim(),
          sector: sector || undefined,
          phone: phone || undefined,
        }),
      })
      const json = await readJson(res)

      if (!res.ok) {
        setError(httpErrorMessage(res, json))
        return
      }

      // Refresh the JWT so the dashboard guard lets the user through
      try {
        await update({ companyName: json?.companyName, onboardingCompleted: true })
      } catch {
        // Entreprise enregistrée mais session non rafraîchie : rechargement complet
        redirecting = true
        window.location.assign('/dashboard')
        return
      }
      redirecting = true
      router.push('/dashboard')
      router.refresh()
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
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="companyName">Nom de l’entreprise</Label>
        <Input
          id="companyName"
          placeholder="Ets. Boissons"
          autoComplete="organization"
          className="h-11"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          disabled={isLoading}
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sector">
          Secteur <span className="font-normal text-muted-foreground">(facultatif)</span>
        </Label>
        <select
          id="sector"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          disabled={isLoading}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Sélectionner…</option>
          {sectors.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">
          Téléphone <span className="font-normal text-muted-foreground">(facultatif)</span>
        </Label>
        <Input
          id="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+225 07…"
          className="h-11"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <Button type="submit" className="mt-2 h-11 w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Enregistrement…
          </>
        ) : (
          <>
            Continuer <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </Button>
    </form>
  )
}
