'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Plus, Trash2, Loader2, RotateCcw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { apiFetch, toastError, toastWarnings } from '@/lib/api-client'
import { formatMoney, formatNumber } from '@/lib/format'
import { ErrorState, PageSkeleton } from '@/components/states'

interface ReturnItem {
  id: string; item_type: string; product_variant_id?: string; packaging_type_id?: string
  quantity: number; unit_price?: number; reason: string; product_name?: string; packaging_name?: string
}

/** Une ligne sélectionnable = une variante « Produit — Emballage » (ce que l'API attend). */
interface VariantOption {
  id: string
  label: string
  price: number
  cost_price: number
}

const NO_ORDER = '__none__'

export default function NewReturnPage() {
  const router = useRouter()
  const [returnType, setReturnType] = useState('client')
  const [clientId, setClientId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [orderId, setOrderId] = useState('')
  const [depotId, setDepotId] = useState('')
  const [reason, setReason] = useState('')
  const [items, setItems] = useState<ReturnItem[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [depots, setDepots] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [packagings, setPackagings] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [newItemType, setNewItemType] = useState('product')
  const [newItemId, setNewItemId] = useState('')
  const [newItemQty, setNewItemQty] = useState('')
  const [newItemReason, setNewItemReason] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [clientJson, supplierJson, orderJson, depotJson, prodJson, pkgJson] = await Promise.all([
        apiFetch('/api/clients?limit=500'),
        apiFetch('/api/suppliers'),
        apiFetch('/api/sales?limit=500'),
        apiFetch('/api/depots'),
        apiFetch('/api/products?limit=500'),
        apiFetch('/api/packaging-types'),
      ])
      setClients(Array.isArray(clientJson?.data) ? clientJson.data : [])
      setSuppliers(Array.isArray(supplierJson?.data) ? supplierJson.data : [])
      setOrders(Array.isArray(orderJson?.data) ? orderJson.data : [])
      setDepots(Array.isArray(depotJson?.data) ? depotJson.data : Array.isArray(depotJson) ? depotJson : [])
      setProducts(Array.isArray(prodJson?.data) ? prodJson.data : Array.isArray(prodJson) ? prodJson : [])
      setPackagings(Array.isArray(pkgJson?.data) ? pkgJson.data : Array.isArray(pkgJson) ? pkgJson : [])
    } catch (e) {
      setLoadError(true)
      toastError(e, 'Impossible de charger le formulaire')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Produits aplatis en variantes : « Produit — Emballage »
  const variantOptions = useMemo<VariantOption[]>(
    () =>
      products.flatMap((p: any) =>
        (Array.isArray(p.variants) ? p.variants : []).map((v: any) => ({
          id: v.id,
          label: v.packaging_name ? `${p.name} — ${v.packaging_name}` : p.name,
          price: Number(v.price || 0),
          cost_price: Number(v.cost_price ?? v.price ?? 0),
        }))
      ),
    [products]
  )

  // Ventes proposées : non annulées, du client choisi le cas échéant
  const orderOptions = useMemo(
    () => orders.filter((o: any) => o.status !== 'cancelled' && (!clientId || o.client_id === clientId)),
    [orders, clientId]
  )

  function indicativePrice(type: string, id: string): number {
    if (type === 'product') {
      const v = variantOptions.find((o) => o.id === id)
      return v ? (returnType === 'supplier' ? v.cost_price : v.price) : 0
    }
    const pkg = packagings.find((p: any) => p.id === id)
    return Number(pkg?.deposit_price || 0)
  }

  function addItem() {
    const qty = Number(newItemQty)
    if (!newItemId || !Number.isInteger(qty) || qty <= 0) {
      toast.error('Quantité invalide', { description: 'Saisissez un nombre entier supérieur à 0.' })
      return
    }
    const label =
      newItemType === 'product'
        ? variantOptions.find((v) => v.id === newItemId)?.label
        : packagings.find((p: any) => p.id === newItemId)?.name
    if (!label) return

    setItems([...items, {
      id: `${Date.now()}-${Math.random()}`,
      item_type: newItemType,
      [newItemType === 'product' ? 'product_variant_id' : 'packaging_type_id']: newItemId,
      quantity: qty,
      unit_price: indicativePrice(newItemType, newItemId),
      reason: newItemReason,
      [newItemType === 'product' ? 'product_name' : 'packaging_name']: label,
    }])
    setNewItemId(''); setNewItemQty(''); setNewItemReason('')
  }

  function removeItem(id: string) {
    setItems(items.filter(i => i.id !== id))
  }

  const estimatedTotal = items.reduce((s, i) => s + (i.unit_price || 0) * i.quantity, 0)

  async function handleSubmit() {
    if (!depotId || items.length === 0 || submitting) return
    if (returnType === 'client' && !clientId && !orderId) {
      toast.error('Client requis', { description: 'Choisissez le client (ou la vente d’origine).' })
      return
    }
    if (returnType === 'supplier' && !supplierId) {
      toast.error('Fournisseur requis')
      return
    }
    const payload = {
      return_type: returnType,
      depot_id: depotId,
      reason,
      // Le prix n'est pas envoyé : le serveur applique le prix de la vente d'origine / du catalogue
      items: items.map(({ id, unit_price, product_name, packaging_name, ...item }) => item),
      ...(returnType === 'client' && clientId && { client_id: clientId }),
      ...(returnType === 'supplier' && { supplier_id: supplierId }),
      ...(returnType === 'client' && orderId && { sales_order_id: orderId }),
    }
    setSubmitting(true)
    try {
      const res = await apiFetch('/api/returns', { method: 'POST', body: payload })
      toast.success(res?.data?.return_number ? `Retour ${res.data.return_number} enregistré` : 'Retour enregistré')
      toastWarnings(res?.warnings)
      router.push('/dashboard/returns')
    } catch (e) {
      toastError(e, 'Retour non enregistré')
    } finally { setSubmitting(false) }
  }

  if (loading) return <PageSkeleton />

  if (loadError) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Nouveau Retour" />
        <main className="flex-1 p-4 lg:p-6">
          <ErrorState title="Impossible de charger le formulaire" onRetry={loadData} />
        </main>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      <DashboardHeader title="Nouveau Retour" />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1000px] mx-auto w-full">
        <Button variant="ghost" onClick={() => router.back()} className="w-fit">
          <ArrowLeft className="h-4 w-4 mr-2" /> Retour
        </Button>

        <Card>
          <CardHeader><CardTitle>Informations du retour</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Type de retour</Label>
                <Select value={returnType} onValueChange={(v) => { setReturnType(v); setOrderId('') }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Retour client</SelectItem>
                    <SelectItem value="supplier">Retour fournisseur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Dépôt</Label>
                <Select value={depotId} onValueChange={setDepotId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>
                    {depots.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {returnType === 'client' && (
                <div>
                  <Label>Client</Label>
                  <Select
                    value={clientId}
                    onValueChange={(v) => {
                      setClientId(v)
                      // La vente choisie doit appartenir au client
                      if (orderId && !orders.some((o: any) => o.id === orderId && o.client_id === v)) setOrderId('')
                    }}
                  >
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {returnType === 'supplier' && (
                <div>
                  <Label>Fournisseur</Label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {returnType === 'client' && (
                <div>
                  <Label>Vente d&apos;origine (optionnel)</Label>
                  <Select value={orderId || NO_ORDER} onValueChange={(v) => setOrderId(v === NO_ORDER ? '' : v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ORDER}>Aucune</SelectItem>
                      {orderOptions.map(o => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.order_number}{o.client_name ? ` — ${o.client_name}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-zinc-500 mt-1">
                    Avec une vente d&apos;origine, le prix de cette vente est appliqué et la quantité est limitée à ce qui a été vendu.
                  </p>
                </div>
              )}
            </div>
            <div>
              <Label>Raison générale</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Raison du retour..." className="mt-1" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Articles retournés</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={newItemType} onValueChange={(v) => { setNewItemType(v); setNewItemId('') }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">Produit</SelectItem>
                    <SelectItem value="packaging">Emballage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Article</Label>
                <Select value={newItemId} onValueChange={setNewItemId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>
                    {newItemType === 'product'
                      ? variantOptions.map(v => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)
                      : packagings.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {newItemId && (
                  <p className="text-xs text-zinc-500 mt-1">
                    Prix indicatif : {formatMoney(indicativePrice(newItemType, newItemId))}
                  </p>
                )}
              </div>
              <div>
                <Label>Quantité</Label>
                <Input type="number" min={1} step={1} value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Raison</Label>
                <Input value={newItemReason} onChange={(e) => setNewItemReason(e.target.value)} placeholder="Pourquoi?" className="mt-1" />
              </div>
              <div className="flex items-end">
                <Button onClick={addItem} disabled={!newItemId || !newItemQty} className="w-full">
                  <Plus className="h-4 w-4 mr-2" /> Ajouter
                </Button>
              </div>
            </div>

            {items.length > 0 && (
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{item.product_name || item.packaging_name}</div>
                      <div className="text-sm text-zinc-500">
                        Qté : {formatNumber(item.quantity)} • Prix indicatif : {formatMoney(item.unit_price)}
                        {item.reason ? ` • ${item.reason}` : ''}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeItem(item.id)}
                      aria-label={`Retirer ${item.product_name || item.packaging_name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex justify-between text-sm pt-2">
                  <span className="text-zinc-500">Total estimé (le montant final est calculé par le serveur)</span>
                  <span className="font-semibold">{formatMoney(estimatedTotal)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => router.back()}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={!depotId || items.length === 0 || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
            Créer le retour
          </Button>
        </div>
      </main>
    </div>
  )
}
