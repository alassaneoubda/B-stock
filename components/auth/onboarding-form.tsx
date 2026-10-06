'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, ArrowRight } from 'lucide-react'
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
    <form onSubmit={onSubmit} className="space-y-5">
      {error && (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 font-medium">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="companyName" className="text-sm font-medium text-zinc-700">
          Nom de l&apos;entreprise
        </Label>
        <Input
          id="companyName"
          placeholder="Ets. Boissons"
          className="h-10"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          disabled={isLoading}
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sector" className="text-sm font-medium text-zinc-700">
          Secteur <span className="text-zinc-400 font-normal">(optionnel)</span>
        </Label>
        <select
          id="sector"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          disabled={isLoading}
          className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-950/10"
        >
          <option value="">Sélectionner…</option>
          {sectors.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone" className="text-sm font-medium text-zinc-700">
          Téléphone <span className="text-zinc-400 font-normal">(optionnel)</span>
        </Label>
        <Input
          id="phone"
          placeholder="+225 07..."
          className="h-10"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <Button
        type="submit"
        className="w-full h-10 bg-zinc-950 hover:bg-zinc-800 text-white text-sm font-semibold"
        disabled={isLoading}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            Continuer <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </Button>
    </form>
  )
}
