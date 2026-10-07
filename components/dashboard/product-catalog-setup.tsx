'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Loader2, PackagePlus, Plus } from 'lucide-react'
import { StatusBadge } from '@/components/app/blocks'
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
import { toast } from 'sonner'
import { apiFetch, errorMessage, toastWarnings } from '@/lib/api-client'

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
      const result = await apiFetch<{
        created?: number
        skipped?: string[]
        message?: string
        warnings?: unknown
      }>('/api/products/catalog', {
        method: 'POST',
        body: { items: payload },
      })
      toast.success(result?.message || 'Produits chargés')
      const skipped = result?.skipped?.length ?? 0
      if (skipped > 0) {
        toast.warning(
          `${skipped} référence${skipped > 1 ? 's' : ''} déjà présente${skipped > 1 ? 's' : ''} ignorée${skipped > 1 ? 's' : ''} : ${result!.skipped!.join(', ')}`,
          { duration: 10_000 }
        )
      }
      toastWarnings(result?.warnings)
      router.refresh()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6 pb-28">
      <div className="rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_0_rgb(15_23_42/0.04)] sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-strong">
            <PackagePlus className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Configurez ce que vous vendez</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Cochez les articles de votre dépôt, ajustez marque, catégorie ou unité si besoin,
              puis saisissez vos deux prix. Un clic charge tout le catalogue d’un coup.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.category} className="space-y-3" aria-label={group.category}>
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{group.category}</h3>
            <span className="tabular text-xs text-muted-foreground">
              {group.rows.filter((r) => r.selected).length} / {group.rows.length} sélectionné{group.rows.length > 1 ? 's' : ''}
            </span>
          </div>
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

      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-8 text-center">
        <p className="text-sm text-muted-foreground">Un article n’est pas dans la liste ?</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/products/new">
            <Plus aria-hidden="true" />
            Ajouter un produit manuellement
          </Link>
        </Button>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:bottom-0 md:left-[16rem]">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-3 lg:px-4">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            <span className="tabular font-semibold text-foreground">{selectedCount}</span>
            {' '}produit{selectedCount > 1 ? 's' : ''} à charger
          </p>
          <Button
            variant="brand"
            size="lg"
            onClick={handleLoad}
            disabled={isLoading || selectedCount === 0}
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
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
        'rounded-xl border bg-card px-4 py-3.5 transition-colors',
        row.selected ? 'border-border shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]' : 'border-border bg-card/60',
        error && 'border-destructive/40',
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={row.selected}
          disabled={disabled}
          onCheckedChange={(v) => onChange({ selected: v === true })}
          className="mt-0.5 size-5"
          aria-label={`Sélectionner ${row.name}`}
        />

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={cn('truncate text-sm font-medium', row.selected ? 'text-foreground' : 'text-muted-foreground')}>
                {row.name}
              </p>
              <p className="font-mono text-xs text-muted-foreground">{row.sku}</p>
            </div>
            <StatusBadge label={row.selected ? 'À charger' : 'Ignoré'} tone={row.selected ? 'success' : 'default'} />
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

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
