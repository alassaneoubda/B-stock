'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BEVERAGE_CATALOG,
  CATALOG_BRANDS,
  CATALOG_CATEGORIES,
  CATALOG_UNITS,
  type CatalogItem,
} from '@/lib/catalog/beverage-catalog'
import { cn } from '@/lib/utils'

type RowState = {
  sku: string
  selected: boolean
  name: string
  brand: string
  category: string
  catalogCategory: string
  baseUnit: string
  purchasePrice: string
  sellingPrice: string
}

function fromCatalog(item: CatalogItem): RowState {
  return {
    sku: item.sku,
    selected: false,
    name: item.name,
    brand: item.brand,
    category: item.category,
    catalogCategory: item.category,
    baseUnit: item.baseUnit,
    purchasePrice: '',
    sellingPrice: '',
  }
}

function parsePrice(value: string): number | null {
  const trimmed = value.replace(/\s/g, '').replace(',', '.')
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export function ProductCatalogSetup() {
  const router = useRouter()
  const [rows, setRows] = useState<RowState[]>(() => BEVERAGE_CATALOG.map(fromCatalog))
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  const selectedCount = rows.filter((r) => r.selected).length

  const groups = useMemo(() => {
    return CATALOG_CATEGORIES.map((category) => ({
      category,
      rows: rows.filter((r) => r.catalogCategory === category),
    })).filter((g) => g.rows.length > 0)
  }, [rows])

  function patchRow(sku: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.sku === sku ? { ...r, ...patch } : r)))
    setRowErrors((prev) => {
      if (!prev[sku]) return prev
      const next = { ...prev }
      delete next[sku]
      return next
    })
  }

  async function handleLoad() {
    setError(null)
    const selected = rows.filter((r) => r.selected)
    if (selected.length === 0) {
      setError('Cochez au moins un produit à charger.')
      return
    }

    const nextErrors: Record<string, string> = {}
    const payload: Array<{
      sku: string
      name: string
      brand: string
      category: string
      baseUnit: string
      purchasePrice: number
      sellingPrice: number
    }> = []

    for (const row of selected) {
      const buy = parsePrice(row.purchasePrice)
      const sell = parsePrice(row.sellingPrice)
      if (buy === null || sell === null) {
        nextErrors[row.sku] = 'Indiquez le prix d’achat et le prix de vente.'
        continue
      }
      payload.push({
        sku: row.sku,
        name: row.name.trim(),
        brand: row.brand,
        category: row.category,
        baseUnit: row.baseUnit,
        purchasePrice: buy,
        sellingPrice: sell,
      })
    }

    if (Object.keys(nextErrors).length > 0) {
      setRowErrors(nextErrors)
      setError('Complétez les prix des lignes cochées.')
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/products/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      })
      const result = await response.json()
      if (!response.ok) {
        setError(result.error || 'Impossible de charger les produits.')
        return
      }
      router.refresh()
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4 pb-28">
      <div className="rounded-xl border border-zinc-200/80 bg-white px-4 py-5 sm:px-6">
        <h2 className="text-base font-semibold text-zinc-950">Configurez ce que vous vendez</h2>
        <p className="mt-1 text-sm text-zinc-500 max-w-2xl">
          Cochez les articles de votre dépôt, ajustez marque / catégorie / unité si besoin,
          puis saisissez vos deux prix. Un clic charge tout le catalogue d’un coup.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {groups.map((group) => (
        <section key={group.category} className="space-y-2">
          <h3 className="px-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            {group.category}
          </h3>
          <div className="space-y-2">
            {group.rows.map((row) => (
              <CatalogRow
                key={row.sku}
                row={row}
                error={rowErrors[row.sku]}
                disabled={isLoading}
                onChange={(patch) => patchRow(row.sku, patch)}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-4 text-center">
        <p className="text-sm text-zinc-500">Un article n’est pas dans la liste ?</p>
        <Button variant="outline" size="sm" className="mt-2" asChild>
          <Link href="/dashboard/products/new">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Ajouter un produit manuellement
          </Link>
        </Button>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-zinc-200 bg-white/95 px-4 py-3 md:bottom-0 md:left-[16rem]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">
            <span className="font-semibold text-zinc-950">{selectedCount}</span>
            {' '}produit{selectedCount > 1 ? 's' : ''} à charger
          </p>
          <Button
            onClick={handleLoad}
            disabled={isLoading || selectedCount === 0}
            className="h-10 px-5"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Charger vos produits
          </Button>
        </div>
      </div>
    </div>
  )
}

function CatalogRow({
  row,
  error,
  disabled,
  onChange,
}: {
  row: RowState
  error?: string
  disabled: boolean
  onChange: (patch: Partial<RowState>) => void
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-white px-3 py-3 sm:px-4 transition-colors',
        row.selected ? 'border-zinc-300' : 'border-zinc-200/80 opacity-[0.72]',
        error && 'border-red-300',
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={row.selected}
          disabled={disabled}
          onCheckedChange={(v) => onChange({ selected: v === true })}
          className="mt-1 size-5"
          aria-label={`Sélectionner ${row.name}`}
        />

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-950 truncate">{row.name}</p>
              <p className="font-mono text-[11px] text-zinc-400">{row.sku}</p>
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                row.selected ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500',
              )}
            >
              {row.selected ? 'Actif' : 'Ignoré'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Marque">
              <Select
                value={row.brand}
                onValueChange={(brand) => onChange({ brand })}
                disabled={disabled || !row.selected}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATALOG_BRANDS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Catégorie">
              <Select
                value={row.category}
                onValueChange={(category) => onChange({ category })}
                disabled={disabled || !row.selected}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATALOG_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Unité">
              <Select
                value={row.baseUnit}
                onValueChange={(baseUnit) => onChange({ baseUnit })}
                disabled={disabled || !row.selected}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATALOG_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Prix d’achat">
              <Input
                inputMode="numeric"
                placeholder="0"
                value={row.purchasePrice}
                disabled={disabled || !row.selected}
                onChange={(e) => onChange({ purchasePrice: e.target.value })}
                className="h-8 text-right"
              />
            </Field>
            <Field label="Prix de vente">
              <Input
                inputMode="numeric"
                placeholder="0"
                value={row.sellingPrice}
                disabled={disabled || !row.selected}
                onChange={(e) => onChange({ sellingPrice: e.target.value })}
                className="h-8 text-right"
              />
            </Field>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-zinc-400 font-medium">{label}</Label>
      {children}
    </div>
  )
}
