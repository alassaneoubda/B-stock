'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Loader2, Search, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

type Option = {
  companies: { id: string; name: string; subscription_status: string; subscription_ends_at: string | null; trial_ends_at: string | null }[]
  plans: { name: string; label: string; price_monthly: string | null; price_yearly: string | null }[]
  methods: Record<string, string>
}

const MONTH_PRESETS = [1, 3, 6, 12]

function suggestedAmount(plan: Option['plans'][number] | undefined, months: number): number {
  if (!plan) return 0
  if (months === 12 && plan.price_yearly && Number(plan.price_yearly) > 0) return Number(plan.price_yearly)
  return Math.round(Number(plan.price_monthly || 0) * months)
}

export function ManualPaymentDialog({
  open,
  onOpenChange,
  onRecorded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecorded: () => void
}) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [planId, setPlanId] = useState('')
  const [months, setMonths] = useState(1)
  const [amount, setAmount] = useState('')
  const [amountTouched, setAmountTouched] = useState(false)
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  const { data, error, isLoading } = useSWR<Option>(
    open ? `/api/admin/billing/manual?q=${encodeURIComponent(debounced)}` : null,
    (url: string) => apiFetch(url),
    { keepPreviousData: true }
  )
  const plan = useMemo(() => data?.plans.find((p) => p.name === planId), [data, planId])

  useEffect(() => {
    if (!amountTouched) setAmount(plan ? String(suggestedAmount(plan, months)) : '')
  }, [plan, months, amountTouched])

  function reset() {
    setQuery('')
    setCompanyId('')
    setCompanyName('')
    setPlanId('')
    setMonths(1)
    setAmount('')
    setAmountTouched(false)
    setMethod('cash')
    setReference('')
    setNote('')
    setFormError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!companyId) return setFormError('Choisissez une entreprise.')
    if (!planId) return setFormError('Choisissez un plan.')
    if (!Number.isInteger(months) || months < 1 || months > 36) return setFormError('Durée : 1 à 36 mois.')
    const amountNum = Number(amount)
    if (amount === '' || !Number.isFinite(amountNum) || amountNum < 0) return setFormError('Montant invalide.')
    setFormError(null)
    setSaving(true)
    try {
      const res = await apiFetch<{ data: { receiptNumber: string; endsAt: string | null } }>('/api/admin/billing/manual', {
        method: 'POST',
        body: { companyId, planId, months, amount: amountNum, method, reference: reference || null, note: note || null },
      })
      toast.success(`Paiement enregistré — reçu ${res.data.receiptNumber}`, {
        description: res.data.endsAt ? `Abonnement prolongé jusqu’au ${formatDate(res.data.endsAt)}` : undefined,
      })
      reset()
      onOpenChange(false)
      onRecorded()
    } catch (err) {
      setFormError(errorMessage(err))
      toastError(err, 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (saving) return
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Enregistrer un paiement</DialogTitle>
            <DialogDescription>
              Paiement reçu hors ligne. L’abonnement est prolongé à partir de la fin de la période en cours et un reçu est
              émis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="mp-company-search">Entreprise</Label>
            {companyId ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                <span className="font-medium text-foreground">{companyName}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setCompanyId(''); setCompanyName('') }}>
                  Changer
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="mp-company-search"
                    className="h-10 pl-9"
                    placeholder="Rechercher une entreprise…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto rounded-lg border border-border" role="listbox" aria-label="Entreprises">
                  {error ? (
                    <p className="p-3 text-sm text-destructive">{errorMessage(error)}</p>
                  ) : isLoading && !data ? (
                    <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement…
                    </p>
                  ) : data?.companies.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">Aucune entreprise trouvée.</p>
                  ) : (
                    data?.companies.map((c) => {
                      const end = c.subscription_status === 'trialing' ? c.trial_ends_at : c.subscription_ends_at
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="option"
                          aria-selected={companyId === c.id}
                          onClick={() => { setCompanyId(c.id); setCompanyName(c.name) }}
                          className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left text-sm transition-colors last:border-0 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                        >
                          <span className="truncate text-foreground">{c.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {c.subscription_status}
                            {end ? ` · fin ${formatDate(end)}` : ''}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              </>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mp-plan">Plan</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger id="mp-plan" className="h-10 w-full">
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {data?.plans.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.label}
                      {p.price_monthly ? ` — ${formatMoney(p.price_monthly)}/mois` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mp-method">Moyen de paiement</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="mp-method" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(data?.methods ?? { cash: 'Espèces' }).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mp-months">Durée (mois)</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {MONTH_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={months === m}
                  onClick={() => setMonths(m)}
                  className={cn(
                    'h-9 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    months === m
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {m} mois
                </button>
              ))}
              <Input
                id="mp-months"
                type="number"
                min={1}
                max={36}
                inputMode="numeric"
                className="h-9 w-20"
                value={months}
                onChange={(e) => setMonths(parseInt(e.target.value || '0', 10))}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mp-amount">Montant reçu (FCFA)</Label>
              <Input
                id="mp-amount"
                type="number"
                min={0}
                inputMode="numeric"
                className="tabular h-10"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setAmountTouched(true) }}
              />
              <p className="text-xs text-muted-foreground">Prérempli d’après le tarif du plan ; modifiable.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mp-ref">Référence (facultatif)</Label>
              <Input
                id="mp-ref"
                className="h-10"
                maxLength={200}
                placeholder="N° de virement, de chèque…"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mp-note">Note interne</Label>
            <Textarea id="mp-note" maxLength={500} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {formError && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => { reset(); onOpenChange(false) }}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              Enregistrer
              {amount !== '' && Number(amount) >= 0 ? ` ${formatMoney(amount)}` : ''}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
