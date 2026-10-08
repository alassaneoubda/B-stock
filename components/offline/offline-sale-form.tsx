'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Banknote, Check, Loader2, Minus, Plus, Search, Smartphone, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format'
import { localAvailable, newRequestId, pendingQuantities, round, type OfflineSale } from '@/lib/offline/queue'
import { loadClients, loadSaleCatalog, loadSaleDepots, type SaleClient, type SaleVariant } from '@/lib/offline/store'
import type { OfflineSalesState } from './use-offline-sales'

type Line = { variant: SaleVariant; quantity: number }

/**
 * « Nouvelle vente » hors ligne (coquille /hors-ligne/vente) : client récent,
 * dépôt et produits mis en cache sur l'appareil, paiement au comptant.
 * Les emballages consignés, le crédit et la création de client exigent le réseau.
 */
export function OfflineSaleForm({ owner, sales }: { owner: string; sales: Pick<OfflineSalesState, 'queue' | 'enqueue'> }) {
  const [depots, setDepots] = useState<{ id: string; name: string; is_main: boolean }[]>([])
  const [depotId, setDepotId] = useState('')
  const [variants, setVariants] = useState<SaleVariant[] | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [clients, setClients] = useState<SaleClient[]>([])
  const [client, setClient] = useState<SaleClient | null>(null)
  const [clientSearch, setClientSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [method, setMethod] = useState<'cash' | 'mobile_money'>('cash')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void loadSaleDepots(owner).then((list) => {
      const d = list ?? []
      setDepots(d)
      setDepotId((current) => current || (d.find((x) => x.is_main) ?? d[0])?.id || '')
    })
    void loadClients(owner).then(setClients)
  }, [owner])

  useEffect(() => {
    if (!depotId) return
    setLines([])
    void loadSaleCatalog(owner, depotId).then((c) => {
      setVariants(c?.variants ?? [])
      setSavedAt(c?.savedAt ?? null)
    })
  }, [owner, depotId])

  const pending = useMemo(() => pendingQuantities(sales.queue, owner, depotId), [sales.queue, owner, depotId])
  const availableOf = (v: SaleVariant) =>
    localAvailable(v.available_stock, pending.get(v.id) ?? 0, lines.find((l) => l.variant.id === v.id)?.quantity ?? 0)

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return clients.slice(0, 8)
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.phone?.includes(q)).slice(0, 20)
  }, [clients, clientSearch])

  const filteredVariants = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    return (variants ?? []).filter((v) => !q || v.product_name.toLowerCase().includes(q))
  }, [variants, productSearch])

  const total = round(lines.reduce((s, l) => s + l.quantity * l.variant.selling_price, 0))

  function add(v: SaleVariant) {
    if (availableOf(v) <= 0) {
      toast.error(`${v.product_name} : plus de stock connu dans ce dépôt`)
      return
    }
    setLines((prev) => {
      const existing = prev.find((l) => l.variant.id === v.id)
      return existing ? prev.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l)) : [...prev, { variant: v, quantity: 1 }]
    })
  }

  function setQty(id: string, quantity: number) {
    setLines((prev) => (quantity <= 0 ? prev.filter((l) => l.variant.id !== id) : prev.map((l) => (l.variant.id === id ? { ...l, quantity } : l))))
  }

  async function save() {
    if (!client || lines.length === 0 || !depotId) return
    setSaving(true)
    try {
      const id = newRequestId()
      const now = new Date().toISOString()
      const name = (v: SaleVariant) => (v.volume ? `${v.product_name} · ${v.volume}` : v.product_name)
      const sale: OfflineSale = {
        id,
        owner,
        kind: 'sale',
        createdAt: now,
        status: 'pending',
        attempts: 0,
        summary: {
          label: `Vente à ${client.name}`,
          depotId,
          depotName: depots.find((d) => d.id === depotId)?.name ?? null,
          clientName: client.name,
          paymentMethod: method,
          total,
          lines: lines.map((l) => ({ variantId: l.variant.id, name: name(l.variant), quantity: l.quantity, unitPrice: l.variant.selling_price })),
        },
        payload: {
          clientRequestId: id,
          offlineSoldAt: now,
          clientId: client.id,
          depotId,
          orderSource: 'in_person',
          paymentMethod: method,
          paidAmount: total,
          notes: notes.trim() || undefined,
          items: lines.map((l) => ({ productVariantId: l.variant.id, quantity: l.quantity, unitPrice: l.variant.selling_price })),
        },
      }
      await sales.enqueue(sale)
      toast.success('Vente enregistrée sur l’appareil', { description: 'Elle sera envoyée au retour du réseau.' })
      setLines([])
      setNotes('')
      setClient(null)
    } catch (e) {
      toast.error('Vente non enregistrée', { description: e instanceof Error ? e.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 p-4 lg:grid-cols-[1fr_380px] lg:p-6">
      <div className="space-y-6">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold text-foreground">Client</h2>
          {client ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{client.name}</p>
                <p className="text-xs text-muted-foreground">{[client.phone, client.zone].filter(Boolean).join(' · ') || '—'}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setClient(null)}>
                Changer
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Client récent (nom ou téléphone)…"
                  aria-label="Rechercher un client"
                  className="h-11 pl-9"
                />
              </div>
              {clients.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun client enregistré sur l’appareil. Ouvrez « Nouvelle vente » une fois avec du réseau.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {filteredClients.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/60" onClick={() => setClient(c)}>
                        <span className="truncate text-sm font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.phone}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">La création d’un nouveau client nécessite le réseau.</p>
            </>
          )}
          {depots.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="offline-depot">Dépôt</Label>
              <Select value={depotId} onValueChange={setDepotId}>
                <SelectTrigger id="offline-depot" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {depots.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-semibold text-foreground">Produits</h2>
            {savedAt && (
              <p className="text-xs text-muted-foreground">
                Stock connu au {new Date(savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            )}
          </div>
          <Input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Rechercher un produit…" aria-label="Rechercher un produit" className="h-11" />
          {variants === null ? null : variants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun produit enregistré pour ce dépôt sur l’appareil. Ouvrez l’étape « Produits » de « Nouvelle vente » une fois avec du réseau.
            </p>
          ) : (
            <ul className="grid max-h-[28rem] gap-2 overflow-y-auto sm:grid-cols-2">
              {filteredVariants.map((v) => {
                const available = availableOf(v)
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => add(v)}
                      disabled={available <= 0}
                      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/60 disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {v.product_name}
                          {v.volume && <span className="font-normal text-muted-foreground"> · {v.volume}</span>}
                        </span>
                        <span className="tabular block text-xs text-muted-foreground">
                          {formatMoney(v.selling_price)} · {available > 0 ? `${available} en stock` : 'Rupture'}
                        </span>
                      </span>
                      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <aside className="space-y-4 rounded-xl border border-border bg-card p-4 lg:sticky lg:top-4 lg:self-start">
        <h2 className="font-semibold text-foreground">Panier</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Touchez un produit pour l’ajouter.</p>
        ) : (
          <ul className="divide-y divide-border">
            {lines.map((l) => (
              <li key={l.variant.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{l.variant.product_name}</span>
                <Button size="icon-sm" variant="ghost" onClick={() => setQty(l.variant.id, l.quantity - 1)} aria-label={`Retirer un ${l.variant.product_name}`}>
                  <Minus />
                </Button>
                <span className="tabular w-6 text-center font-semibold">{l.quantity}</span>
                <Button size="icon-sm" variant="ghost" onClick={() => add(l.variant)} aria-label={`Ajouter un ${l.variant.product_name}`}>
                  <Plus />
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => setQty(l.variant.id, 0)} aria-label={`Supprimer ${l.variant.product_name}`}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Mode de paiement">
          {(
            [
              { id: 'cash', label: 'Espèces', icon: Banknote },
              { id: 'mobile_money', label: 'Mobile Money', icon: Smartphone },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={method === id}
              onClick={() => setMethod(id)}
              className={cn(
                'flex min-h-12 items-center justify-center gap-2 rounded-lg border text-sm font-medium',
                method === id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Hors ligne : paiement intégral uniquement (le crédit exige le contrôle du plafond par le serveur).</p>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (facultatif)" aria-label="Notes" maxLength={2000} />
        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-sm font-medium">Total</span>
          <span className="tabular text-2xl font-semibold">{formatMoney(total)}</span>
        </div>
        <Button variant="brand" size="xl" className="w-full" disabled={!client || lines.length === 0 || saving} onClick={() => void save()}>
          {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
          Enregistrer la vente
        </Button>
      </aside>
    </div>
  )
}
