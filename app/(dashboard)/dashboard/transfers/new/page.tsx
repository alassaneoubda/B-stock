'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Plus, Trash2, Loader2, ArrowLeftRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { apiFetch, toastError } from '@/lib/api-client'
import { formatNumber } from '@/lib/format'
import { ErrorState, PageSkeleton } from '@/components/states'

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

  if (refsLoading) {
    return <PageSkeleton />
  }

  if (refsError) {
    return (
      <div className="flex flex-col min-h-screen bg-muted/30">
        <DashboardHeader title="Nouveau Transfert" />
        <main className="flex-1 p-4 lg:p-6 max-w-[1000px] mx-auto w-full">
          <ErrorState description="Les dépôts et articles n'ont pas pu être chargés." onRetry={loadReferences} />
        </main>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-muted/30">
      <DashboardHeader title="Nouveau Transfert" />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1000px] mx-auto w-full">
        <Button variant="ghost" onClick={() => router.back()} className="w-fit">
          <ArrowLeft className="h-4 w-4 mr-2" /> Retour
        </Button>

        <Card>
          <CardHeader><CardTitle>Informations du transfert</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="source-depot">Dépôt source</Label>
                <Select value={sourceDepotId} onValueChange={setSourceDepotId}>
                  <SelectTrigger id="source-depot" className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>
                    {depots.map(d => (
                      <SelectItem key={d.id} value={d.id} disabled={d.id === destDepotId}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dest-depot">Dépôt destination</Label>
                <Select value={destDepotId} onValueChange={setDestDepotId}>
                  <SelectTrigger id="dest-depot" className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>
                    {depots.map(d => (
                      <SelectItem key={d.id} value={d.id} disabled={d.id === sourceDepotId}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {stockError && (
              <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <span>Le stock du dépôt source n&apos;a pas pu être chargé.</span>
                <Button size="sm" variant="outline" onClick={() => setStockReloadKey((k) => k + 1)}>Réessayer</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Articles à transférer</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={newItemType} onValueChange={(v) => { setNewItemType(v); setNewItemId(''); setItemError(null) }}>
                  <SelectTrigger className="mt-1" aria-label="Type d'article"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">Produit</SelectItem>
                    <SelectItem value="packaging">Emballage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Article</Label>
                <Select value={newItemId} onValueChange={(v) => { setNewItemId(v); setItemError(null) }}>
                  <SelectTrigger className="mt-1" aria-label="Article"><SelectValue placeholder="Choisir..." /></SelectTrigger>
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
              <div>
                <Label htmlFor="new-item-qty">Quantité</Label>
                <Input
                  id="new-item-qty"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={newItemQty}
                  onChange={(e) => { setNewItemQty(e.target.value); setItemError(null) }}
                  className="mt-1"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={addItem} disabled={!sourceDepotId || stockLoading || stockError || !newItemId || !newItemQty} className="w-full">
                  {stockLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Ajouter
                </Button>
              </div>
            </div>

            {!sourceDepotId && (
              <p className="text-sm text-muted-foreground">Choisissez d&apos;abord le dépôt source pour voir le stock disponible.</p>
            )}
            {itemError && <p role="alert" className="text-sm text-destructive">{itemError}</p>}
            {overStock && (
              <p role="alert" className="text-sm text-destructive">
                Certaines lignes dépassent le stock disponible du dépôt source : ajustez-les avant de créer le transfert.
              </p>
            )}

            {items.length > 0 && (
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{item.product_name || item.packaging_name}</div>
                      <div className="text-sm text-muted-foreground">
                        Qté : {formatNumber(item.quantity)} • Disponible :{' '}
                        {stockLoading ? '…' : formatNumber(availableFor(item.item_type, itemRefId(item)))}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Retirer ${item.product_name || item.packaging_name || "l'article"}`}
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => router.back()} disabled={submitting}>Annuler</Button>
          <Button
            onClick={handleSubmit}
            disabled={!sourceDepotId || !destDepotId || items.length === 0 || submitting || stockLoading || overStock}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowLeftRight className="h-4 w-4 mr-2" />}
            Créer le transfert
          </Button>
        </div>
      </main>
    </div>
  )
}
