'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, PackageOpen, Wine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Panel, StatusBadge } from '@/components/app/blocks'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { apiFetch, toastError } from '@/lib/api-client'
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format'

/**
 * Ouverture de casier (déconditionnement) : un casier de 12 devient 12 bouteilles
 * vendables à l'unité, au coût du casier / 12 (valeur du stock conservée).
 */

/** Conditionnement ouvrable dans un dépôt (variante liée à une variante unité). */
export type UnpackOption = {
  packVariantId: string
  depotId: string
  depotName: string
  /** « Bock — 66 cl · Casier de 12 » */
  label: string
  /** Conditionnements en stock dans ce dépôt. */
  available: number
  unitsPerPack: number
}

const optionKey = (o: { packVariantId: string; depotId: string }) => `${o.packVariantId}:${o.depotId}`

export function UnpackStockDialog({
  open,
  onOpenChange,
  options,
  defaultKey,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: UnpackOption[]
  /** `${packVariantId}:${depotId}` présélectionné. */
  defaultKey?: string | null
  onDone?: () => void
}) {
  const [key, setKey] = useState('')
  const [packs, setPacks] = useState('1')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setKey(defaultKey && options.some((o) => optionKey(o) === defaultKey) ? defaultKey : options[0] ? optionKey(options[0]) : '')
    setPacks('1')
    setNotes('')
    // Réinitialisé à l'ouverture seulement (les options sont recalculées à chaque rendu du parent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const selected = options.find((o) => optionKey(o) === key)
  const count = Math.floor(Number(packs))
  const valid = Boolean(selected) && Number.isInteger(count) && count > 0 && count <= (selected?.available ?? 0)

  async function submit() {
    if (!selected || !valid) return
    setSubmitting(true)
    try {
      const res = await apiFetch<{ message?: string }>('/api/stock/unpack', {
        method: 'POST',
        body: { depotId: selected.depotId, packVariantId: selected.packVariantId, packs: count, notes: notes.trim() || null },
      })
      toast.success(res.message ?? 'Casier ouvert')
      onOpenChange(false)
      onDone?.()
    } catch (e) {
      toastError(e, 'Ouverture impossible')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ouvrir un casier</DialogTitle>
          <DialogDescription>
            Les casiers ouverts sortent du stock et leurs bouteilles deviennent vendables à l’unité, au coût du casier divisé par
            le nombre de bouteilles.
          </DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun conditionnement ouvrable en stock. Activez « Vendre aussi à la bouteille » sur la fiche produit.
          </p>
        ) : (
          <div className="grid gap-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="unpack-pack">Conditionnement</Label>
              <Select value={key} onValueChange={setKey}>
                <SelectTrigger id="unpack-pack" className="h-10 w-full">
                  <SelectValue placeholder="Choisir" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={optionKey(o)} value={optionKey(o)}>
                      {o.label} · {o.depotName} ({formatNumber(o.available)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unpack-count">Nombre à ouvrir</Label>
              <Input
                id="unpack-count"
                type="number"
                inputMode="numeric"
                min={1}
                max={selected?.available}
                value={packs}
                onChange={(e) => setPacks(e.target.value)}
                className="h-10"
              />
              {selected && (
                <p className="text-xs text-muted-foreground">
                  {valid
                    ? `+${formatNumber(count * selected.unitsPerPack)} unités · ${formatNumber(selected.available - count)} restant(s)`
                    : `Entre 1 et ${formatNumber(selected.available)}`}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unpack-notes">Note (facultatif)</Label>
              <Input id="unpack-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} className="h-10" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button variant="brand" onClick={() => void submit()} disabled={submitting || !valid}>
            {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <PackageOpen aria-hidden="true" />}
            Ouvrir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type UnpackRow = {
  id: string
  created_at: string
  packs: number
  units: number
  source: 'manual' | 'pos'
  notes: string | null
  unit_cost: number
  value: number
  product_name: string
  pack_name: string | null
  unit_name: string | null
  depot_name: string
  created_by_name: string | null
  ticket_number: string | null
}

/** Historique des ouvertures de casier (toute l'entreprise ou un produit). */
export function UnpackHistory({ productId, reloadKey = 0, limit = 30 }: { productId?: string; reloadKey?: number; limit?: number }) {
  const [rows, setRows] = useState<UnpackRow[] | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    setError(false)
    const params = new URLSearchParams({ limit: String(limit) })
    if (productId) params.set('productId', productId)
    apiFetch<{ data: UnpackRow[] }>(`/api/stock/unpack?${params}`)
      .then((res) => !cancelled && setRows(res.data ?? []))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [productId, reloadKey, limit, retry])

  if (error) return <ErrorState description="L’historique des ouvertures n’a pas pu être chargé." onRetry={() => setRetry((r) => r + 1)} />
  if (!rows) {
    return (
      <div className="p-5">
        <TableSkeleton rows={3} columns={5} />
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={PackageOpen}
        title="Aucun casier ouvert"
        description="Les ouvertures de casier (manuelles ou au point de vente) apparaîtront ici."
      />
    )
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Date</TableHead>
            <TableHead>Produit</TableHead>
            <TableHead className="text-right">Ouverts</TableHead>
            <TableHead className="text-right">Unités</TableHead>
            <TableHead className="text-right">Coût unitaire</TableHead>
            <TableHead>Origine</TableHead>
            <TableHead className="pr-5">Par</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="tabular pl-5 text-sm text-muted-foreground">{formatDateTime(r.created_at)}</TableCell>
              <TableCell>
                <p className="text-sm font-medium text-foreground">{r.product_name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.pack_name ?? 'Conditionnement'} → {r.unit_name ?? 'Unité'} · {r.depot_name}
                </p>
              </TableCell>
              <TableCell className="tabular text-right text-sm text-destructive">−{formatNumber(r.packs)}</TableCell>
              <TableCell className="tabular text-right text-sm text-success">+{formatNumber(r.units)}</TableCell>
              <TableCell className="tabular text-right text-sm text-muted-foreground">{formatMoney(r.unit_cost)}</TableCell>
              <TableCell>
                <StatusBadge
                  label={r.source === 'pos' ? `Point de vente${r.ticket_number ? ` · ${r.ticket_number}` : ''}` : 'Manuelle'}
                  tone={r.source === 'pos' ? 'brand' : 'default'}
                />
              </TableCell>
              <TableCell className="pr-5 text-sm text-muted-foreground">{r.created_by_name || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fiche produit
// ---------------------------------------------------------------------------

export type ProductUnpackVariant = {
  id: string
  packaging_name: string | null
  units_per_case: number | null
  unit_variant_id: string | null
  price: number
  is_returnable: boolean | null
}

/** Actions de la fiche produit : « Vendre aussi à la bouteille », « Ouvrir un casier », historique. */
export function ProductUnpackPanel({
  productId,
  productName,
  variants,
  stock,
}: {
  productId: string
  productName: string
  variants: ProductUnpackVariant[]
  /** Stock agrégé par (variante, dépôt). */
  stock: { variantId: string; depotId: string; depotName: string; quantity: number }[]
}) {
  const router = useRouter()
  const [unitFor, setUnitFor] = useState<ProductUnpackVariant | null>(null)
  const [unpackOpen, setUnpackOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const unitIds = new Set(variants.map((v) => v.unit_variant_id).filter(Boolean))
  // Conditionnements (plus d'une unité) qui ne sont pas eux-mêmes une variante unité
  const packs = variants.filter((v) => Number(v.units_per_case ?? 1) > 1 && !unitIds.has(v.id))
  const label = (v: ProductUnpackVariant) => `${productName}${v.packaging_name ? ` — ${v.packaging_name}` : ''}`

  const options = useMemo<UnpackOption[]>(
    () =>
      packs
        .filter((v) => v.unit_variant_id)
        .flatMap((v) =>
          stock
            .filter((s) => s.variantId === v.id && s.quantity > 0)
            .map((s) => ({
              packVariantId: v.id,
              depotId: s.depotId,
              depotName: s.depotName,
              label: label(v),
              available: s.quantity,
              unitsPerPack: Number(v.units_per_case ?? 1),
            }))
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variants, stock]
  )

  if (packs.length === 0) return null

  return (
    <Panel
      title="Vente à la bouteille"
      description="Ouvrez un casier pour vendre ses bouteilles à l’unité"
      action={
        <Button size="sm" variant="brand" onClick={() => setUnpackOpen(true)} disabled={options.length === 0}>
          <PackageOpen aria-hidden="true" />
          Ouvrir un casier
        </Button>
      }
    >
      <ul className="divide-y divide-border">
        {packs.map((v) => {
          const unit = variants.find((u) => u.id === v.unit_variant_id)
          return (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{v.packaging_name ?? 'Conditionnement'}</p>
                <p className="text-xs text-muted-foreground">
                  {unit
                    ? `Vendu aussi à l’unité : ${unit.packaging_name ?? 'unité'} à ${formatMoney(unit.price)}`
                    : `${formatNumber(v.units_per_case)} unités par conditionnement · vente à l’unité non activée`}
                </p>
              </div>
              {unit ? (
                <StatusBadge label="À l’unité" tone="success" />
              ) : (
                <Button size="sm" variant="outline" onClick={() => setUnitFor(v)}>
                  <Wine aria-hidden="true" />
                  Vendre aussi à la bouteille
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <div className="border-t border-border">
        <p className="px-5 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Casiers ouverts</p>
        <UnpackHistory productId={productId} reloadKey={reloadKey} limit={10} />
      </div>

      <UnitVariantDialog
        productId={productId}
        pack={unitFor}
        packLabel={unitFor ? label(unitFor) : ''}
        onOpenChange={(o) => !o && setUnitFor(null)}
        onDone={() => router.refresh()}
      />
      <UnpackStockDialog
        open={unpackOpen}
        onOpenChange={setUnpackOpen}
        options={options}
        onDone={() => {
          setReloadKey((k) => k + 1)
          router.refresh()
        }}
      />
    </Panel>
  )
}

/** « Vendre aussi à la bouteille » : crée la variante unité liée au conditionnement. */
function UnitVariantDialog({
  productId,
  pack,
  packLabel,
  onOpenChange,
  onDone,
}: {
  productId: string
  pack: ProductUnpackVariant | null
  packLabel: string
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const [price, setPrice] = useState('')
  const [returnable, setReturnable] = useState(true)
  const [deposit, setDeposit] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const units = Number(pack?.units_per_case ?? 1)

  useEffect(() => {
    if (!pack) return
    // Suggestion : prix du casier / nombre de bouteilles, arrondi aux 25 FCFA supérieurs
    setPrice(units > 0 ? String(Math.ceil(Number(pack.price) / units / 25) * 25) : '')
    // Casier = verre consigné ; pack / carton = emballage perdu
    setReturnable(pack.is_returnable !== false)
    setDeposit('')
  }, [pack, units])

  const priceValue = Number(price)
  const valid = price.trim() !== '' && Number.isFinite(priceValue) && priceValue >= 0

  async function submit() {
    if (!pack || !valid) return
    setSubmitting(true)
    try {
      await apiFetch(`/api/products/${productId}/unit-variant`, {
        method: 'POST',
        body: {
          packVariantId: pack.id,
          price: priceValue,
          returnable,
          depositPrice: returnable && deposit.trim() ? Number(deposit) : undefined,
        },
      })
      toast.success('Vente à l’unité activée')
      onOpenChange(false)
      onDone()
    } catch (e) {
      toastError(e, 'Activation impossible')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={Boolean(pack)} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vendre aussi à la bouteille</DialogTitle>
          <DialogDescription>
            {packLabel} : un nouveau format « à l’unité » est créé. Son stock vient de l’ouverture de casiers
            ({formatNumber(units)} unités par casier).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="unit-price">Prix de vente d’une unité (FCFA)</Label>
            <Input
              id="unit-price"
              type="number"
              inputMode="numeric"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-10"
            />
            {pack && units > 0 && (
              <p className="text-xs text-muted-foreground">
                Casier à {formatMoney(pack.price)}, soit {formatMoney(Number(pack.price) / units)} par unité.
              </p>
            )}
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-brand"
              checked={returnable}
              onChange={(e) => setReturnable(e.target.checked)}
            />
            <span>
              <span className="font-medium text-foreground">Bouteille consignée</span>
              <span className="block text-xs text-muted-foreground">
                Verre à rendre (cochez) ; décochez pour une canette ou une bouteille plastique perdue.
              </span>
            </span>
          </label>
          {returnable && (
            <div className="space-y-1.5">
              <Label htmlFor="unit-deposit">Consigne par bouteille (FCFA, facultatif)</Label>
              <Input
                id="unit-deposit"
                type="number"
                inputMode="numeric"
                min={0}
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                className="h-10"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button variant="brand" onClick={() => void submit()} disabled={submitting || !valid}>
            {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            Activer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
