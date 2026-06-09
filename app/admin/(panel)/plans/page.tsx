'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Pencil, Trash2, X, Star } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n)
const xof = (n: number) => fmt(n) + ' FCFA'

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
  const { data, isLoading, mutate } = useSWR<{ data: Plan[] }>('/api/admin/plans', fetcher)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [creating, setCreating] = useState(false)

  const plans = data?.data || []

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950">Plans d&apos;abonnement</h1>
          <p className="text-sm text-zinc-500">
            Source unique : pilote les tarifs du checkout GeniusPay
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="bg-zinc-950 hover:bg-zinc-800">
          <Plus className="h-4 w-4 mr-1.5" /> Nouveau plan
        </Button>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((p) => {
            const prices = asArray<Price>(p.checkout_prices)
            const monthly = prices.find((x) => x.interval === 'monthly')
            return (
              <Card key={p.id} className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h2 className="text-lg font-bold text-zinc-950">{p.display_name || p.name}</h2>
                    <p className="text-xs text-zinc-400 font-mono">{p.name}</p>
                  </div>
                  <button onClick={() => setEditing(p)} className="text-zinc-400 hover:text-zinc-900">
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {p.is_active ? (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Actif</Badge>
                  ) : (
                    <Badge className="bg-zinc-100 text-zinc-500 hover:bg-zinc-100">Inactif</Badge>
                  )}
                  {p.is_public ? (
                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Public</Badge>
                  ) : (
                    <Badge className="bg-zinc-100 text-zinc-500 hover:bg-zinc-100">Masqué</Badge>
                  )}
                  {p.is_popular && (
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                      <Star className="h-3 w-3 mr-1" /> Populaire
                    </Badge>
                  )}
                </div>

                <p className="text-2xl font-bold text-zinc-950 mb-0.5">
                  {monthly ? xof(monthly.price) : xof(Number(p.price_monthly))}
                  <span className="text-sm font-normal text-zinc-400">/mois</span>
                </p>
                <p className="text-xs text-zinc-400 mb-3">{prices.length} tarif(s) configuré(s)</p>

                <ul className="space-y-1 text-sm text-zinc-600 border-t border-zinc-100 pt-3">
                  <li>Utilisateurs : {p.max_users === -1 ? '∞' : p.max_users}</li>
                  <li>Dépôts : {p.max_depots === -1 ? '∞' : p.max_depots}</li>
                  <li>Produits : {p.max_products === -1 ? '∞' : p.max_products}</li>
                </ul>
                <p className="text-xs text-zinc-400 mt-3">{p.subscribers} abonné(s)</p>
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
    </div>
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
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const checkout_prices = INTERVALS.filter((i) => prices[i.key] !== '' && prices[i.key] != null).map(
        (i) => {
          const price = Number(prices[i.key])
          return {
            interval: i.key,
            months: i.months,
            price,
            label: `${fmt(price)} XOF / ${i.suffix}`,
          }
        }
      )
      const marketing_features = features
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)

      const payload: Record<string, unknown> = {
        display_name: displayName || name,
        description,
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
      if (!isEdit) payload.name = name

      const url = isEdit ? `/api/admin/plans/${plan!.id}` : '/api/admin/plans'
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Erreur')
        return
      }
      onSaved()
    } catch {
      setError('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!plan) return
    if (!confirm(`Supprimer le plan "${plan.name}" ?`)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/plans/${plan.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Erreur')
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 sticky top-0 bg-white">
          <h2 className="font-bold text-zinc-950">
            {isEdit ? `Modifier ${plan!.display_name || plan!.name}` : 'Nouveau plan'}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {!isEdit && (
              <Field label="Identifiant (slug, immuable)">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: premium" />
              </Field>
            )}
            <Field label="Nom affiché">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Pack Premium" />
            </Field>
            <Field label="Ordre d'affichage">
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
            </Field>
          </div>

          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          {/* Tarifs checkout */}
          <div>
            <p className="text-xs font-semibold text-zinc-700 uppercase tracking-wide mb-2">
              Tarifs (FCFA) — pilotent le checkout
            </p>
            <p className="text-xs text-zinc-400 mb-3">
              Laisser vide pour ne pas proposer cet intervalle. 0 = activation gratuite directe.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {INTERVALS.map((i) => (
                <Field key={i.key} label={i.label}>
                  <Input
                    type="number"
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
            <p className="text-xs font-semibold text-zinc-700 uppercase tracking-wide mb-2">
              Limites (-1 = illimité)
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Utilisateurs">
                <Input type="number" value={maxUsers} onChange={(e) => setMaxUsers(Number(e.target.value))} />
              </Field>
              <Field label="Dépôts">
                <Input type="number" value={maxDepots} onChange={(e) => setMaxDepots(Number(e.target.value))} />
              </Field>
              <Field label="Produits">
                <Input type="number" value={maxProducts} onChange={(e) => setMaxProducts(Number(e.target.value))} />
              </Field>
              <Field label="Clients">
                <Input type="number" value={maxClients} onChange={(e) => setMaxClients(Number(e.target.value))} />
              </Field>
            </div>
          </div>

          <Field label="Fonctionnalités (une par ligne)">
            <textarea
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950/10"
              placeholder={'Gestion des ventes\nMulti-dépôts\nSupport prioritaire'}
            />
          </Field>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Actif
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Public (page tarifs)
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={isPopular} onChange={(e) => setIsPopular(e.target.checked)} /> Populaire
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-100 sticky bottom-0 bg-white">
          {isEdit ? (
            <Button variant="outline" onClick={remove} className="text-red-600 border-red-200 hover:bg-red-50" disabled={saving}>
              <Trash2 className="h-4 w-4 mr-1.5" /> Supprimer
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={save} className="bg-zinc-950 hover:bg-zinc-800" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-zinc-600">{label}</Label>
      {children}
    </div>
  )
}
