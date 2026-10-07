'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Loader2, PackagePlus, Plus, Trash2 } from 'lucide-react'
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
  CONTENT_UNITS,
  MAX_UNITS_PER_PACK,
  MIN_UNITS_PER_PACK,
  PACK_KINDS,
  packagingDescription,
  type CatalogProduct,
  type ContentUnit,
  type PackKind,
} from '@/lib/catalog/beverage-catalog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { apiFetch, errorMessage, toastWarnings } from '@/lib/api-client'

type VariationState = {
  /** Identifiant local : la référence catalogue, ou « custom-n » pour un format ajouté. */
  id: string
  sku: string | null
  selected: boolean
  volume: string
  packKind: PackKind
  unitsPerPack: string
  contentUnit: ContentUnit
  purchasePrice: string
  sellingPrice: string
}

type ProductState = {
  key: string
  name: string
  brand: string
  category: string
  catalogCategory: string
  variations: VariationState[]
}

function fromCatalog(product: CatalogProduct): ProductState {
  return {
    key: product.key,
    name: product.name,
    brand: product.brand,
    category: product.category,
    catalogCategory: product.category,
    variations: product.variations.map((v) => ({
      id: v.sku,
      sku: v.sku,
      selected: false,
      volume: v.volume,
      packKind: v.packKind,
      unitsPerPack: String(v.unitsPerPack),
      contentUnit: v.contentUnit,
      purchasePrice: '',
      sellingPrice: '',
    })),
  }
}

function parsePrice(value: string): number | null {
  const trimmed = value.replace(/\s/g, '').replace(',', '.')
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

function parseUnits(value: string): number | null {
  const n = Number(value.trim())
  if (!Number.isInteger(n) || n < MIN_UNITS_PER_PACK || n > MAX_UNITS_PER_PACK) return null
  return n
}

let customSeq = 0

export function ProductCatalogSetup({ redirectTo }: { redirectTo?: string } = {}) {
  const router = useRouter()
  const [products, setProducts] = useState<ProductState[]>(() => BEVERAGE_CATALOG.map(fromCatalog))
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  const selectedCount = products.reduce((n, p) => n + p.variations.filter((v) => v.selected).length, 0)

  const groups = useMemo(() => {
    return CATALOG_CATEGORIES.map((category) => ({
      category,
      products: products.filter((p) => p.catalogCategory === category),
    })).filter((g) => g.products.length > 0)
  }, [products])

  function clearRowError(id: string) {
    setRowErrors((prev) => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  function patchProduct(key: string, patch: Partial<ProductState>) {
    setProducts((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  }

  function patchVariation(key: string, id: string, patch: Partial<VariationState>) {
    setProducts((prev) =>
      prev.map((p) =>
        p.key === key
          ? { ...p, variations: p.variations.map((v) => (v.id === id ? { ...v, ...patch } : v)) }
          : p
      )
    )
    clearRowError(id)
  }

  function addVariation(key: string) {
    customSeq += 1
    const id = `custom-${customSeq}`
    setProducts((prev) =>
      prev.map((p) =>
        p.key === key
          ? {
              ...p,
              variations: [
                ...p.variations,
                {
                  id,
                  sku: null,
                  selected: true,
                  volume: '',
                  packKind: 'Casier',
                  unitsPerPack: '12',
                  contentUnit: 'bouteilles',
                  purchasePrice: '',
                  sellingPrice: '',
                },
              ],
            }
          : p
      )
    )
  }

  function removeVariation(key: string, id: string) {
    setProducts((prev) =>
      prev.map((p) => (p.key === key ? { ...p, variations: p.variations.filter((v) => v.id !== id) } : p))
    )
    clearRowError(id)
  }

  async function handleLoad() {
    setError(null)
    if (selectedCount === 0) {
      setError('Cochez au moins un format à charger.')
      return
    }

    const nextErrors: Record<string, string> = {}
    const items: Array<{
      key: string
      name: string
      brand: string
      category: string
      variations: Array<{
        sku: string | null
        volume: string
        packKind: PackKind
        unitsPerPack: number
        contentUnit: ContentUnit
        purchasePrice: number
        sellingPrice: number
      }>
    }> = []

    for (const product of products) {
      const variations = []
      for (const v of product.variations.filter((x) => x.selected)) {
        const units = parseUnits(v.unitsPerPack)
        const buy = parsePrice(v.purchasePrice)
        const sell = parsePrice(v.sellingPrice)
        if (!v.volume.trim()) {
          nextErrors[v.id] = 'Indiquez la contenance (ex. 66 cl).'
        } else if (units === null) {
          nextErrors[v.id] = `Le contenu doit être un nombre entier entre ${MIN_UNITS_PER_PACK} et ${MAX_UNITS_PER_PACK}.`
        } else if (buy === null || sell === null) {
          nextErrors[v.id] = `Indiquez le prix d’achat et le prix de vente d’un ${v.packKind.toLowerCase()}.`
        } else {
          variations.push({
            sku: v.sku,
            volume: v.volume.trim(),
            packKind: v.packKind,
            unitsPerPack: units,
            contentUnit: v.contentUnit,
            purchasePrice: buy,
            sellingPrice: sell,
          })
        }
      }
      if (variations.length > 0) {
        items.push({ key: product.key, name: product.name.trim(), brand: product.brand, category: product.category, variations })
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setRowErrors(nextErrors)
      setError('Complétez les formats cochés.')
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
        body: { items },
      })
      toast.success(result?.message || 'Produits chargés')
      const skipped = result?.skipped?.length ?? 0
      if (skipped > 0) {
        toast.warning(
          `${skipped} format${skipped > 1 ? 's' : ''} déjà présent${skipped > 1 ? 's' : ''} ignoré${skipped > 1 ? 's' : ''} : ${result!.skipped!.join(', ')}`,
          { duration: 10_000 }
        )
      }
      toastWarnings(result?.warnings)
      if (redirectTo) router.push(redirectTo)
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
              Votre stock est compté par conditionnement : casier, pack ou carton. Cochez les formats de votre
              dépôt, vérifiez ce que contient chaque conditionnement, puis saisissez son prix d’achat et son prix
              de vente.
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

      {groups.map((group) => {
        const groupSelected = group.products.reduce((n, p) => n + p.variations.filter((v) => v.selected).length, 0)
        return (
          <section key={group.category} className="space-y-3" aria-label={group.category}>
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{group.category}</h3>
              <span className="tabular text-xs text-muted-foreground">
                {groupSelected} format{groupSelected > 1 ? 's' : ''} sélectionné{groupSelected > 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-2">
              {group.products.map((product) => (
                <ProductCard
                  key={product.key}
                  product={product}
                  errors={rowErrors}
                  disabled={isLoading}
                  onProductChange={(patch) => patchProduct(product.key, patch)}
                  onVariationChange={(id, patch) => patchVariation(product.key, id, patch)}
                  onAddVariation={() => addVariation(product.key)}
                  onRemoveVariation={(id) => removeVariation(product.key, id)}
                />
              ))}
            </div>
          </section>
        )
      })}

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
            {' '}format{selectedCount > 1 ? 's' : ''} à charger
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

function ProductCard({
  product,
  errors,
  disabled,
  onProductChange,
  onVariationChange,
  onAddVariation,
  onRemoveVariation,
}: {
  product: ProductState
  errors: Record<string, string>
  disabled: boolean
  onProductChange: (patch: Partial<ProductState>) => void
  onVariationChange: (id: string, patch: Partial<VariationState>) => void
  onAddVariation: () => void
  onRemoveVariation: (id: string) => void
}) {
  const selected = product.variations.filter((v) => v.selected).length
  const hasError = product.variations.some((v) => errors[v.id])

  return (
    <div
      className={cn(
        'rounded-xl border bg-card transition-colors',
        selected > 0 ? 'border-border shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]' : 'border-border bg-card/60',
        hasError && 'border-destructive/40',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className={cn('truncate text-sm font-semibold', selected > 0 ? 'text-foreground' : 'text-muted-foreground')}>
            {product.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {product.variations.length} format{product.variations.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={product.brand} onValueChange={(brand) => onProductChange({ brand })} disabled={disabled}>
            <SelectTrigger size="sm" className="w-36" aria-label={`Marque de ${product.name}`}>
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
          <Select value={product.category} onValueChange={(category) => onProductChange({ category })} disabled={disabled}>
            <SelectTrigger size="sm" className="w-44" aria-label={`Catégorie de ${product.name}`}>
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
          <StatusBadge
            label={selected > 0 ? `${selected} à charger` : 'Ignoré'}
            tone={selected > 0 ? 'success' : 'default'}
          />
        </div>
      </div>

      <div className="divide-y divide-border">
        {product.variations.map((variation) => (
          <VariationRow
            key={variation.id}
            productName={product.name}
            variation={variation}
            error={errors[variation.id]}
            disabled={disabled}
            onChange={(patch) => onVariationChange(variation.id, patch)}
            onRemove={variation.sku ? undefined : () => onRemoveVariation(variation.id)}
          />
        ))}
      </div>

      <div className="px-4 py-2">
        <Button variant="ghost" size="sm" onClick={onAddVariation} disabled={disabled} className="text-muted-foreground">
          <Plus aria-hidden="true" />
          Ajouter un format
        </Button>
      </div>
    </div>
  )
}

function VariationRow({
  productName,
  variation,
  error,
  disabled,
  onChange,
  onRemove,
}: {
  productName: string
  variation: VariationState
  error?: string
  disabled: boolean
  onChange: (patch: Partial<VariationState>) => void
  onRemove?: () => void
}) {
  const off = disabled || !variation.selected
  const pack = variation.packKind.toLowerCase()
  const units = parseUnits(variation.unitsPerPack)
  const summary =
    units !== null
      ? `1 ${pack} = ${packagingDescription({ ...variation, unitsPerPack: units }).replace(`${variation.packKind} de `, '')}`
      : null

  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <Checkbox
        checked={variation.selected}
        disabled={disabled}
        onCheckedChange={(v) => onChange({ selected: v === true })}
        className="mt-6 size-5"
        aria-label={`Sélectionner ${productName} ${variation.volume}`}
      />

      <div className="min-w-0 flex-1 space-y-2">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <Field label="Format">
            <Input
              value={variation.volume}
              placeholder="66 cl"
              disabled={off}
              onChange={(e) => onChange({ volume: e.target.value })}
              className="h-8"
              aria-label={`Contenance — ${productName}`}
            />
          </Field>
          <Field label="Conditionnement">
            <Select value={variation.packKind} onValueChange={(packKind) => onChange({ packKind: packKind as PackKind })} disabled={off}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PACK_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Contenu">
            <div className="flex gap-1.5">
              <Input
                inputMode="numeric"
                value={variation.unitsPerPack}
                disabled={off}
                onChange={(e) => onChange({ unitsPerPack: e.target.value.replace(/\D/g, '') })}
                className="h-8 w-16 text-right"
                aria-label={`Nombre d’unités par ${pack}`}
              />
              <Select value={variation.contentUnit} onValueChange={(contentUnit) => onChange({ contentUnit: contentUnit as ContentUnit })} disabled={off}>
                <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Type d’unité">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Field>
          <Field label={`Prix d’achat / ${pack}`}>
            <Input
              inputMode="numeric"
              placeholder="0"
              value={variation.purchasePrice}
              disabled={off}
              onChange={(e) => onChange({ purchasePrice: e.target.value })}
              className="h-8 text-right"
            />
          </Field>
          <Field label={`Prix de vente / ${pack}`}>
            <Input
              inputMode="numeric"
              placeholder="0"
              value={variation.sellingPrice}
              disabled={off}
              onChange={(e) => onChange({ sellingPrice: e.target.value })}
              className="h-8 text-right"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-2">
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{summary ?? ' '}</p>
          )}
          {onRemove && (
            <Button variant="ghost" size="icon-sm" onClick={onRemove} disabled={disabled} aria-label="Retirer ce format">
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
