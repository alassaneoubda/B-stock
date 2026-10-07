'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Link2, Loader2, PackagePlus, Search, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { usePermissions } from '@/components/providers/permissions-provider'
import { ApiError, apiFetch, toastError } from '@/lib/api-client'
import { formatMoney } from '@/lib/format'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { normalizeBarcode } from './barcode-format'

/** Variante trouvée par GET /api/products/barcode/[code]. */
export type BarcodeMatch = {
  variant_id: string
  product_id: string
  product_name: string
  brand: string | null
  category: string | null
  barcode: string
  price: number
  cost_price: number | null
  packaging_name: string | null
  units_per_case: number | null
  is_active: boolean
  stock: number | null
}

/** Libellé court d'une variante : « Bock · Casier 12 ». */
export function matchLabel(m: Pick<BarcodeMatch, 'product_name' | 'packaging_name'>) {
  if (!m.packaging_name || m.packaging_name.startsWith('Emballage - ')) return m.product_name
  return `${m.product_name} · ${m.packaging_name}`
}

type LookupResult =
  | { status: 'found'; match: BarcodeMatch }
  | { status: 'unknown'; code: string }
  | { status: 'error'; message: string }

/**
 * Recherche d'un code-barres dans le catalogue de l'entreprise, avec la boîte
 * « Code inconnu » (proposition d'association si l'utilisateur a le droit
 * products.write). Rendre `dialog` dans l'écran appelant.
 *
 *   const { lookup, dialog } = useBarcodeLookup({ onAssigned: addToCart })
 *   const r = await lookup(code)
 *   if (r.status === 'found') addToCart(r.match)
 */
export function useBarcodeLookup(options: { depotId?: string | null; onAssigned?: (match: BarcodeMatch) => void } = {}) {
  const { depotId } = options
  const onAssignedRef = useRef(options.onAssigned)
  useEffect(() => {
    onAssignedRef.current = options.onAssigned
  })
  const cacheRef = useRef(new Map<string, BarcodeMatch>())
  const [unknownCode, setUnknownCode] = useState<string | null>(null)

  // Le stock renvoyé dépend du dépôt : cache vidé quand il change
  useEffect(() => {
    cacheRef.current.clear()
  }, [depotId])

  const lookup = useCallback(
    async (raw: string, opts: { promptUnknown?: boolean } = {}): Promise<LookupResult> => {
      const code = normalizeBarcode(raw)
      if (!code) return { status: 'error', message: 'Code-barres invalide' }
      const cached = cacheRef.current.get(code)
      if (cached) return { status: 'found', match: cached }
      try {
        const qs = depotId ? `?depotId=${encodeURIComponent(depotId)}` : ''
        const res = await apiFetch<{ data: BarcodeMatch; warning?: string }>(
          `/api/products/barcode/${encodeURIComponent(code)}${qs}`
        )
        cacheRef.current.set(code, res.data)
        if (res.warning) toast.warning(res.warning)
        return { status: 'found', match: res.data }
      } catch (e) {
        if (e instanceof ApiError && e.status === 404 && e.code === 'BARCODE_UNKNOWN') {
          if (opts.promptUnknown !== false) setUnknownCode(code)
          return { status: 'unknown', code }
        }
        if (e instanceof ApiError && e.status === 401) return { status: 'error', message: e.message }
        toastError(e, 'Recherche du code-barres impossible')
        return { status: 'error', message: e instanceof Error ? e.message : 'Recherche impossible' }
      }
    },
    [depotId]
  )

  const dialog = (
    <UnknownBarcodeDialog
      code={unknownCode}
      onClose={() => setUnknownCode(null)}
      onAssigned={(match) => {
        cacheRef.current.set(match.barcode, match)
        setUnknownCode(null)
        onAssignedRef.current?.(match)
      }}
    />
  )

  return { lookup, dialog }
}

type ProductOption = {
  id: string
  name: string
  brand: string | null
  variants: { id: string; barcode: string | null; price: number; packaging_name: string | null }[]
}

/** Boîte « Code inconnu » : association à une variante existante ou création d'un produit. */
export function UnknownBarcodeDialog({
  code,
  onClose,
  onAssigned,
}: {
  code: string | null
  onClose: () => void
  onAssigned: (match: BarcodeMatch) => void
}) {
  const { can } = usePermissions()
  const canAssign = can('products.write')
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search.trim(), 300)
  const [options, setOptions] = useState<ProductOption[]>([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    if (!code) {
      setSearch('')
      setOptions([])
    }
  }, [code])

  useEffect(() => {
    if (!code || !canAssign || debounced.length < 2) {
      setOptions([])
      return
    }
    const controller = new AbortController()
    setLoading(true)
    apiFetch<{ data: ProductOption[] }>(`/api/products?search=${encodeURIComponent(debounced)}&limit=20`, {
      signal: controller.signal,
    })
      .then((res) => setOptions(res.data ?? []))
      .catch((e) => toastError(e, 'Recherche de produits impossible'))
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [code, canAssign, debounced])

  async function assign(variantId: string) {
    if (!code) return
    setSavingId(variantId)
    try {
      const res = await apiFetch<{ data: BarcodeMatch }>(`/api/products/barcode/${encodeURIComponent(code)}`, {
        method: 'POST',
        body: { variantId },
      })
      toast.success('Code-barres associé', { description: matchLabel(res.data) })
      onAssigned(res.data)
    } catch (e) {
      toastError(e, 'Association impossible')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Dialog open={Boolean(code)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <span className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning-foreground sm:mx-0">
            <SearchX className="h-6 w-6" aria-hidden="true" />
          </span>
          <DialogTitle>Code-barres inconnu</DialogTitle>
          <DialogDescription>
            Aucun produit de votre catalogue ne porte le code <span className="font-mono font-medium text-foreground">{code}</span>.
          </DialogDescription>
        </DialogHeader>

        {canAssign ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Associer ce code à un produit existant</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom du produit…"
                aria-label="Rechercher le produit à associer"
                className="h-11 pl-9"
                autoFocus
                data-scanner-ignore
              />
              {loading && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Recherche en cours" />
              )}
            </div>
            {options.length > 0 && (
              <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {options.flatMap((p) =>
                  p.variants.map((v) => (
                    <li key={v.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {matchLabel({ product_name: p.name, packaging_name: v.packaging_name })}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatMoney(v.price)}
                          {v.barcode ? ` · code actuel ${v.barcode}` : ' · sans code-barres'}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => void assign(v.id)} disabled={savingId !== null}>
                        {savingId === v.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Link2 aria-hidden="true" />}
                        {v.barcode ? 'Remplacer' : 'Associer'}
                      </Button>
                    </li>
                  ))
                )}
              </ul>
            )}
            {debounced.length >= 2 && !loading && options.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun produit ne correspond.</p>
            )}
          </div>
        ) : (
          <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
            Demandez à un gérant d’associer ce code au bon produit dans le catalogue.
          </p>
        )}

        <DialogFooter>
          {canAssign && (
            <Button variant="ghost" asChild>
              <Link href={`/dashboard/products/new?barcode=${encodeURIComponent(code ?? '')}`} target="_blank" rel="noopener">
                <PackagePlus aria-hidden="true" /> Créer un produit
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
