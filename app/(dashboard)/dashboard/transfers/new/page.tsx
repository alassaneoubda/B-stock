'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Plus, Trash2, Loader2, ArrowLeftRight, RotateCw } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { apiFetch, toastError } from '@/lib/api-client'
import { formatNumber } from '@/lib/format'
import { ErrorState, PageSkeleton } from '@/components/states'
import { PageShell } from '@/components/app/blocks'
import { cn } from '@/lib/utils'

interface TransferItem {
  id: string; item_type: string; product_variant_id?: string; packaging_type_id?: string
  quantity: number; product_name?: string; packaging_name?: string
}

interface StockInfo {
  product_variant_id?: string; variant_id?: string; quantity: number
}

interface PackagingStockInfo {
  packaging_type_id: string; quantity: number
}

function itemRefId(item: TransferItem): string {
  return (item.item_type === 'product' ? item.product_variant_id : item.packaging_type_id) || ''
}

export default function NewTransferPage() {
  const router = useRouter()
  const [sourceDepotId, setSourceDepotId] = useState('')
  const [destDepotId, setDestDepotId] = useState('')
  const [items, setItems] = useState<TransferItem[]>([])
  const [depots, setDepots] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [packagings, setPackagings] = useState<any[]>([])
  const [stockInfo, setStockInfo] = useState<StockInfo[]>([])
  const [packagingStockInfo, setPackagingStockInfo] = useState<PackagingStockInfo[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [newItemType, setNewItemType] = useState('product')
  const [newItemId, setNewItemId] = useState('')
  const [newItemQty, setNewItemQty] = useState('')
  const [itemError, setItemError] = useState<string | null>(null)
  const [refsLoading, setRefsLoading] = useState(true)
  const [refsError, setRefsError] = useState(false)
  const [stockLoading, setStockLoading] = useState(false)
  const [stockError, setStockError] = useState(false)
  const [stockReloadKey, setStockReloadKey] = useState(0)

  // Stock disponible du dépôt source (toutes les lignes / lots)
  useEffect(() => {
    setStockInfo([])
    setPackagingStockInfo([])
    setStockError(false)
    if (!sourceDepotId) return
    const controller = new AbortController()
    setStockLoading(true)
    Promise.all([
      apiFetch<{ data: StockInfo[] }>(`/api/stock?depotId=${sourceDepotId}`, { signal: controller.signal }),
      apiFetch<{ data: PackagingStockInfo[] }>(`/api/packaging/stock?depotId=${sourceDepotId}`, { signal: controller.signal }),
    ])
      .then(([stockJson, pkgStockJson]) => {
        setStockInfo(Array.isArray(stockJson.data) ? stockJson.data : [])
        setPackagingStockInfo(Array.isArray(pkgStockJson.data) ? pkgStockJson.data : [])
        setStockLoading(false)
      })
      .catch((e) => {
        if ((e as Error)?.name === 'AbortError') return
        setStockError(true)
        setStockLoading(false)
        toastError(e, 'Stock du dépôt source indisponible')
      })
    return () => controller.abort()
  }, [sourceDepotId, stockReloadKey])

  const loadReferences = useCallback(async () => {
    setRefsError(false)
    try {
      const [depotJson, prodJson, pkgJson] = await Promise.all([
        apiFetch<{ data: any[] }>('/api/depots'),
        apiFetch<{ data: any[] }>('/api/products'),
        apiFetch<{ data: any[] }>('/api/packaging-types'),
      ])
      setDepots(Array.isArray(depotJson.data) ? depotJson.data : [])
      const productList = Array.isArray(prodJson.data) ? prodJson.data : []
      // L'API attend des identifiants de variante (produit + conditionnement), pas de produit.
      setProducts(productList.flatMap((p: any) =>
        (Array.isArray(p.variants) ? p.variants : []).map((v: any) => ({
          id: v.id,
          name: v.packaging_name ? `${p.name} — ${v.packaging_name}` : p.name,
        }))
      ))
      setPackagings(Array.isArray(pkgJson.data) ? pkgJson.data : [])
    } catch {
      setRefsError(true)
    } finally {
      setRefsLoading(false)
    }
  }, [])

  useEffect(() => { loadReferences() }, [loadReferences])

  /** Stock disponible d'un article dans le dépôt source : somme de toutes ses lignes (multi-lots). */
  function availableFor(itemType: string, id: string): number {
    if (itemType === 'product') {
      return stockInfo
        .filter((s) => (s.product_variant_id ?? s.variant_id) === id)
        .reduce((sum, s) => sum + Number(s.quantity || 0), 0)
    }
    return packagingStockInfo
      .filter((s) => s.packaging_type_id === id)
      .reduce((sum, s) => sum + Number(s.quantity || 0), 0)
  }

  /** Quantité déjà ajoutée au transfert pour cet article (toutes lignes confondues). */
  function addedFor(itemType: string, id: string): number {
    return items
      .filter((i) => i.item_type === itemType && itemRefId(i) === id)
      .reduce((sum, i) => sum + i.quantity, 0)
  }

  function addItem() {
    setItemError(null)
    if (!newItemId || !newItemQty) return
    const item = newItemType === 'product'
      ? products.find((p: any) => p.id === newItemId)
      : packagings.find((p: any) => p.id === newItemId)
    if (!item) return

    const quantity = Number(newItemQty)
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setItemError('La quantité doit être un nombre entier positif.')
      return
    }
    const remaining = availableFor(newItemType, newItemId) - addedFor(newItemType, newItemId)
    if (quantity > remaining) {
      setItemError(`Quantité supérieure au stock disponible dans le dépôt source (${formatNumber(Math.max(0, remaining))}).`)
      return
    }

    setItems([...items, {
      id: Date.now().toString(),
      item_type: newItemType,
      [newItemType === 'product' ? 'product_variant_id' : 'packaging_type_id']: newItemId,
      quantity,
      [newItemType === 'product' ? 'product_name' : 'packaging_name']: item.name,
    }])
    setNewItemId(''); setNewItemQty('')
  }

  function removeItem(id: string) {
    setItems(items.filter(i => i.id !== id))
  }

  // Après un changement de dépôt source, des lignes peuvent dépasser le nouveau stock
  const overStock = !!sourceDepotId && !stockLoading && !stockError && items.some(
    (item) => addedFor(item.item_type, itemRefId(item)) > availableFor(item.item_type, itemRefId(item))
  )

  async function handleSubmit() {
    if (!sourceDepotId || !destDepotId || items.length === 0 || submitting) return
    setSubmitting(true)
    try {
      await apiFetch('/api/transfers', {
        method: 'POST',
        body: {
          source_depot_id: sourceDepotId,
          destination_depot_id: destDepotId,
          items: items.map(({ item_type, product_variant_id, packaging_type_id, quantity }) => ({
            item_type, product_variant_id, packaging_type_id, quantity,
          })),
        },
      })
      toast.success('Transfert créé')
      router.push('/dashboard/transfers')
    } catch (e) {
      toastError(e, 'Création du transfert impossible')
      setSubmitting(false)
    }
  }

  const header = (
    <DashboardHeader title="Nouveau transfert" description="Déplacer du stock d'un dépôt à un autre" />
  )

  const backLink = (
    <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" asChild>
      <Link href="/dashboard/transfers">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Transferts
      </Link>
    </Button>
  )

  if (refsLoading) {
    return <PageSkeleton />
  }

  if (refsError) {
    return (
      <div className="flex min-h-screen flex-col">
        {header}
        <PageShell className="max-w-3xl">
          {backLink}
          <ErrorState description="Les dépôts et articles n'ont pas pu être chargés." onRetry={loadReferences} />
        </PageShell>
      </div>
    )
  }

  const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <div className="flex min-h-screen flex-col">
      {header}
      <PageShell className="max-w-3xl">
        {backLink}

        <Card>
          <CardHeader>
            <CardTitle>Trajet</CardTitle>
            <CardDescription>Le stock est débité du dépôt source et crédité au dépôt destination à la réception.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="source-depot">Dépôt source</Label>
                <Select value={sourceDepotId} onValueChange={setSourceDepotId}>
                  <SelectTrigger id="source-depot" className="h-10 w-full"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>
                    {depots.map(d => (
                      <SelectItem key={d.id} value={d.id} disabled={d.id === destDepotId}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dest-depot">Dépôt destination</Label>
                <Select value={destDepotId} onValueChange={setDestDepotId}>
                  <SelectTrigger id="dest-depot" className="h-10 w-full"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>
                    {depots.map(d => (
                      <SelectItem key={d.id} value={d.id} disabled={d.id === sourceDepotId}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {stockError && (
              <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <span>Le stock du dépôt source n&apos;a pas pu être chargé.</span>
                <Button size="sm" variant="outline" onClick={() => setStockReloadKey((k) => k + 1)}>
                  <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Réessayer
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Articles à transférer</CardTitle>
            <CardDescription>Ajoutez les produits et emballages un par un, dans la limite du stock disponible.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-item-type">Type</Label>
                <Select value={newItemType} onValueChange={(v) => { setNewItemType(v); setNewItemId(''); setItemError(null) }}>
                  <SelectTrigger id="new-item-type" className="h-10 w-full" aria-label="Type d'article"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">Produit</SelectItem>
                    <SelectItem value="packaging">Emballage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-item-id">Article</Label>
                <Select value={newItemId} onValueChange={(v) => { setNewItemId(v); setItemError(null) }}>
                  <SelectTrigger id="new-item-id" className="h-10 w-full" aria-label="Article"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>
                    {(newItemType === 'product' ? products : packagings).map(item => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                        {sourceDepotId && !stockLoading && !stockError
                          ? ` (dispo : ${formatNumber(availableFor(newItemType, item.id))})`
                          : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-item-qty">Quantité</Label>
                <Input
                  id="new-item-qty"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={newItemQty}
                  onChange={(e) => { setNewItemQty(e.target.value); setItemError(null) }}
                  className="tabular h-10"
                />
                {!sourceDepotId && (
                  <p className="text-xs text-muted-foreground">Choisissez d&apos;abord le dépôt source pour voir le stock disponible.</p>
                )}
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={addItem}
                  disabled={!sourceDepotId || stockLoading || stockError || !newItemId || !newItemQty}
                  className="h-10 w-full"
                >
                  {stockLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                  Ajouter la ligne
                </Button>
              </div>
            </div>

            {itemError && <p role="alert" className="text-sm text-destructive">{itemError}</p>}
            {overStock && (
              <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                Certaines lignes dépassent le stock disponible du dépôt source : ajustez-les avant de créer le transfert.
              </p>
            )}

            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Aucun article ajouté pour l&apos;instant.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <ul className="divide-y divide-border">
                  {items.map(item => {
                    const available = availableFor(item.item_type, itemRefId(item))
                    const over = !stockLoading && addedFor(item.item_type, itemRefId(item)) > available
                    return (
                      <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{item.product_name || item.packaging_name}</p>
                          <p className={cn('tabular text-xs', over ? 'text-destructive' : 'text-muted-foreground')}>
                            {item.item_type === 'product' ? 'Produit' : 'Emballage'} · disponible{' '}
                            {stockLoading ? '…' : formatNumber(available)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="tabular text-sm font-semibold text-foreground">{formatNumber(item.quantity)}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            aria-label={`Retirer ${item.product_name || item.packaging_name || "l'article"}`}
                            onClick={() => removeItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                <div className="flex justify-between border-t border-border bg-muted/40 px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">
                    {formatNumber(items.length)} ligne{items.length > 1 ? 's' : ''}
                  </span>
                  <span className="tabular font-medium text-foreground">{formatNumber(totalUnits)} unité{totalUnits > 1 ? 's' : ''}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => router.back()} disabled={submitting}>Annuler</Button>
          <Button
            variant="brand"
            onClick={handleSubmit}
            disabled={!sourceDepotId || !destDepotId || items.length === 0 || submitting || stockLoading || overStock}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />}
            Créer le transfert
          </Button>
        </div>
      </PageShell>
    </div>
  )
}
