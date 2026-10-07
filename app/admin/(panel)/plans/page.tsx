'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageShell, PageIntro, StatusBadge } from '@/components/app/blocks'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, Plus, Pencil, Trash2, X, Star, Package } from 'lucide-react'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatMoney, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState } from '@/components/states'

const fetcher = (url: string) => apiFetch(url)

type PricingType = 'paid' | 'free' | 'on_quote'

const PRICING_TYPES: { value: PricingType; label: string; badge: 'info' | 'success' | 'brand' }[] = [
  { value: 'paid', label: 'Payant', badge: 'info' },
  { value: 'free', label: 'Gratuit', badge: 'success' },
  { value: 'on_quote', label: 'Sur devis', badge: 'brand' },
]

function pricingTypeOf(v: unknown): PricingType {
  return v === 'free' || v === 'on_quote' ? v : 'paid'
}

type Price = { interval: string; months: number; price: number; label: string }
type Plan = {
  id: string
  name: string
  display_name: string | null
  description: string | null
  price_monthly: number
  price_yearly: number
  max_users: number
  max_depots: number
  max_products: number
  max_clients: number
  is_active: boolean
  is_public: boolean
  is_popular: boolean
  pricing_type?: PricingType | null
  sort_order: number
  checkout_prices: Price[] | null
  marketing_features: string[] | null
  subscribers: number
}

const INTERVALS = [
  { key: 'monthly', months: 1, suffix: 'mois', label: 'Mensuel' },
  { key: 'quarterly', months: 3, suffix: '3 mois', label: 'Trimestriel' },
  { key: 'semiannual', months: 6, suffix: '6 mois', label: 'Semestriel' },
  { key: 'yearly', months: 12, suffix: 'an', label: 'Annuel' },
]

function asArray<T>(v: T[] | string | null | undefined): T[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try {
      return JSON.parse(v)
    } catch {
      return []
    }
  }
  return []
}

export default function AdminPlansPage() {
  const { data, error, isLoading, mutate } = useSWR<{ data: Plan[] }>('/api/admin/plans', fetcher)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [creating, setCreating] = useState(false)

  const plans = data?.data || []

  return (
    <PageShell>
      <PageIntro
        title="Plans d’abonnement"
        description="Source unique : pilote les tarifs du checkout GeniusPay"
        actions={
          <Button variant="brand" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nouveau plan
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Chargement">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState description={errorMessage(error)} onRetry={() => mutate()} />
      ) : plans.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Aucun plan d'abonnement"
          description="Créez un premier plan pour l'afficher sur la page tarifs et le checkout."
          action={{ label: 'Nouveau plan', onClick: () => setCreating(true) }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => {
            const prices = asArray<Price>(p.checkout_prices)
            const monthly = prices.find((x) => x.interval === 'monthly')
            const pricingType = pricingTypeOf(p.pricing_type)
            const pt = PRICING_TYPES.find((t) => t.value === pricingType)!
            return (
              <Card key={p.id} className="gap-0 p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-semibold tracking-tight text-foreground">{p.display_name || p.name}</h2>
                    <p className="font-mono text-xs text-muted-foreground">{p.name}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(p)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Modifier le plan ${p.display_name || p.name}`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="mb-4 flex flex-wrap gap-1.5">
                  <Badge variant={pt.badge}>{pt.label}</Badge>
                  <StatusBadge label={p.is_active ? 'Actif' : 'Inactif'} tone={p.is_active ? 'success' : 'default'} />
                  <Badge variant={p.is_public ? 'info' : 'muted'}>{p.is_public ? 'Public' : 'Masqué'}</Badge>
                  {p.is_popular && (
                    <Badge variant="warning" className="gap-1">
                      <Star className="h-3 w-3" aria-hidden="true" /> Populaire
                    </Badge>
                  )}
                </div>

                {pricingType === 'on_quote' ? (
                  <p className="text-2xl font-semibold tracking-tight text-foreground">Sur devis</p>
                ) : (
                  <p className="tabular text-2xl font-semibold tracking-tight text-foreground">
                    {formatMoney(monthly ? monthly.price : p.price_monthly)}
                    <span className="text-sm font-normal text-muted-foreground"> /mois</span>
                  </p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">{prices.length} tarif(s) configuré(s)</p>

                <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Utilisateurs</dt>
                    <dd className="tabular font-medium text-foreground">{p.max_users === -1 ? '∞' : formatNumber(p.max_users)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Dépôts</dt>
                    <dd className="tabular font-medium text-foreground">{p.max_depots === -1 ? '∞' : formatNumber(p.max_depots)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Produits</dt>
                    <dd className="tabular font-medium text-foreground">{p.max_products === -1 ? '∞' : formatNumber(p.max_products)}</dd>
                  </div>
                </dl>
                <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span className="tabular font-medium text-foreground">{formatNumber(p.subscribers)}</span> abonné(s)
                </p>
              </Card>
            )
          })}
        </div>
      )}

      {(creating || editing) && (
        <PlanModal
          plan={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            mutate()
          }}
        />
      )}
    </PageShell>
  )
}

function PlanModal({
  plan,
  onClose,
  onSaved,
}: {
  plan: Plan | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!plan
  const existingPrices = asArray<Price>(plan?.checkout_prices)

  const [name, setName] = useState(plan?.name || '')
  const [displayName, setDisplayName] = useState(plan?.display_name || '')
  const [description, setDescription] = useState(plan?.description || '')
  const [pricingType, setPricingType] = useState<PricingType>(pricingTypeOf(plan?.pricing_type))
  const [isActive, setIsActive] = useState(plan?.is_active ?? true)
  const [isPublic, setIsPublic] = useState(plan?.is_public ?? true)
  const [isPopular, setIsPopular] = useState(plan?.is_popular ?? false)
  const [sortOrder, setSortOrder] = useState(plan?.sort_order ?? 0)
  const [maxUsers, setMaxUsers] = useState(plan?.max_users ?? 1)
  const [maxDepots, setMaxDepots] = useState(plan?.max_depots ?? 1)
  const [maxProducts, setMaxProducts] = useState(plan?.max_products ?? 50)
  const [maxClients, setMaxClients] = useState(plan?.max_clients ?? -1)
  const [features, setFeatures] = useState(asArray<string>(plan?.marketing_features).join('\n'))
  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const r: Record<string, string> = {}
    for (const i of INTERVALS) {
      const found = existingPrices.find((p) => p.interval === i.key)
      r[i.key] = found ? String(found.price) : ''
    }
    return r
  })

  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Cohérence tarifs / type, alignée sur les règles du checkout GeniusPay. */
  function validate(filled: { price: number }[]): string | null {
    if (!isEdit && name.trim().length < 2) return "L'identifiant doit contenir au moins 2 caractères."
    if (filled.some((p) => !Number.isFinite(p.price) || p.price < 0)) {
      return 'Les tarifs doivent être des montants positifs.'
    }
    if (pricingType === 'paid') {
      if (filled.length === 0) return 'Un plan payant doit proposer au moins un tarif.'
      if (filled.some((p) => p.price <= 0)) {
        return 'Un plan payant ne peut pas avoir de tarif à 0 FCFA (choisissez « Gratuit »).'
      }
    }
    if (pricingType === 'free') {
      if (filled.length === 0) return 'Un plan gratuit doit proposer au moins une durée (tarif à 0).'
      if (filled.some((p) => p.price !== 0)) return 'Tous les tarifs d’un plan gratuit doivent être à 0 FCFA.'
    }
    return null
  }

  async function save() {
    if (saving) return
    setError(null)
    const checkout_prices = INTERVALS.filter((i) => prices[i.key] !== '' && prices[i.key] != null).map((i) => {
      const price = Number(prices[i.key])
      return {
        interval: i.key,
        months: i.months,
        price,
        label: `${formatMoney(price)} / ${i.suffix}`,
      }
    })
    const invalid = validate(checkout_prices)
    if (invalid) {
      setError(invalid)
      return
    }

    setSaving(true)
    try {
      const marketing_features = features
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)

      const payload: Record<string, unknown> = {
        display_name: displayName || name,
        description,
        pricing_type: pricingType,
        is_active: isActive,
        is_public: isPublic,
        is_popular: isPopular,
        sort_order: sortOrder,
        max_users: maxUsers,
        max_depots: maxDepots,
        max_products: maxProducts,
        max_clients: maxClients,
        price_monthly: Number(prices.monthly || 0),
        price_yearly: Number(prices.yearly || 0),
        checkout_prices,
        marketing_features,
      }
      if (!isEdit) payload.name = name.trim()

      const url = isEdit ? `/api/admin/plans/${plan!.id}` : '/api/admin/plans'
      await apiFetch(url, { method: isEdit ? 'PATCH' : 'POST', body: payload })
      toast.success(isEdit ? 'Plan mis à jour' : 'Plan créé')
      onSaved()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!plan || saving) return
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/api/admin/plans/${plan.id}`, { method: 'DELETE' })
      toast.success(`Plan « ${plan.display_name || plan.name} » supprimé`)
      setConfirmDelete(false)
      onSaved()
    } catch (e) {
      setConfirmDelete(false)
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4"
        onClick={saving ? undefined : onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-modal-title"
          className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4">
            <h2 id="plan-modal-title" className="text-[15px] font-semibold tracking-tight text-foreground">
              {isEdit ? `Modifier ${plan!.display_name || plan!.name}` : 'Nouveau plan'}
            </h2>
            <button
              onClick={onClose}
              disabled={saving}
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-6 p-6">
            {error && (
              <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {!isEdit && (
                <Field label="Identifiant (slug, immuable)">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: premium" />
                </Field>
              )}
              <Field label="Nom affiché">
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Pack Premium" />
              </Field>
              <Field label="Ordre d'affichage">
                <Input type="number" className="tabular" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
              </Field>
              <Field label="Type de tarification">
                <Select value={pricingType} onValueChange={(v) => setPricingType(pricingTypeOf(v))}>
                  <SelectTrigger className="w-full" aria-label="Type de tarification">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICING_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Description">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>

            {/* Tarifs checkout */}
            <div>
              <h3 className="text-sm font-semibold text-foreground">Tarifs (FCFA) — pilotent le checkout</h3>
              <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
                {pricingType === 'paid' &&
                  'Laisser vide pour ne pas proposer cet intervalle. Chaque tarif proposé doit être supérieur à 0.'}
                {pricingType === 'free' &&
                  'Activation directe sans paiement : saisir 0 pour chaque durée proposée, laisser vide sinon.'}
                {pricingType === 'on_quote' &&
                  'Sur devis : aucun tarif n’est affiché ni activable par le client (attribution par un administrateur).'}
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {INTERVALS.map((i) => (
                  <Field key={i.key} label={i.label}>
                    <Input
                      type="number"
                      min={0}
                      value={prices[i.key]}
                      onChange={(e) => setPrices((p) => ({ ...p, [i.key]: e.target.value }))}
                      placeholder="—"
                    />
                  </Field>
                ))}
              </div>
            </div>

            {/* Limites */}
            <div>
              <h3 className="text-sm font-semibold text-foreground">Limites</h3>
              <p className="mb-3 mt-0.5 text-xs text-muted-foreground">-1 = illimité</p>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Utilisateurs">
                  <Input type="number" className="tabular" value={maxUsers} onChange={(e) => setMaxUsers(Number(e.target.value))} />
                </Field>
                <Field label="Dépôts">
                  <Input type="number" className="tabular" value={maxDepots} onChange={(e) => setMaxDepots(Number(e.target.value))} />
                </Field>
                <Field label="Produits">
                  <Input type="number" className="tabular" value={maxProducts} onChange={(e) => setMaxProducts(Number(e.target.value))} />
                </Field>
                <Field label="Clients">
                  <Input type="number" className="tabular" value={maxClients} onChange={(e) => setMaxClients(Number(e.target.value))} />
                </Field>
              </div>
            </div>

            <Field label="Fonctionnalités (une par ligne)">
              <textarea
                value={features}
                onChange={(e) => setFeatures(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={'Gestion des ventes\nMulti-dépôts\nSupport prioritaire'}
              />
            </Field>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Actif
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Public (page tarifs)
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary" checked={isPopular} onChange={(e) => setIsPopular(e.target.checked)} /> Populaire
              </label>
            </div>
          </div>

          <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-card px-6 py-4">
            {isEdit ? (
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={saving}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Supprimer
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Annuler
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={(o) => !saving && setConfirmDelete(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le plan « {plan?.display_name || plan?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le plan disparaîtra définitivement de la page tarifs et du checkout. Cette action est
              irréversible ; elle est refusée si des entreprises y sont encore abonnées (désactivez-le
              plutôt).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              className={buttonVariants({ variant: 'destructive' })}
              onClick={(e) => {
                e.preventDefault()
                remove()
              }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}
