'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Plus, Trash2, Loader2, RotateCcw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { apiFetch, toastError, toastWarnings } from '@/lib/api-client'
import { formatMoney, formatNumber } from '@/lib/format'
import { ErrorState, PageSkeleton } from '@/components/states'
import { PageShell } from '@/components/app/blocks'

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

  const backButton = (
    <Button variant="ghost" size="sm" onClick={() => router.back()} className="-ml-2 w-fit text-muted-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Retours
    </Button>
  )

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title="Nouveau retour" />
        <PageShell className="max-w-3xl">
          {backButton}
          <ErrorState title="Impossible de charger le formulaire" onRetry={loadData} />
        </PageShell>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title="Nouveau retour"
        description="Produits ou emballages rendus par un client, ou renvoyés à un fournisseur"
      />
      <PageShell className="max-w-3xl">
        {backButton}

        <Card>
          <CardHeader>
            <CardTitle>Informations du retour</CardTitle>
            <CardDescription>Qui retourne la marchandise et dans quel dépôt elle est reprise.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="return-type">Type de retour</Label>
                <Select value={returnType} onValueChange={(v) => { setReturnType(v); setOrderId('') }}>
                  <SelectTrigger id="return-type" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Retour client</SelectItem>
                    <SelectItem value="supplier">Retour fournisseur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="return-depot">Dépôt</Label>
                <Select value={depotId} onValueChange={setDepotId}>
                  <SelectTrigger id="return-depot" className="w-full"><SelectValue placeholder="Choisir un dépôt" /></SelectTrigger>
                  <SelectContent>
                    {depots.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Le stock retourné sera mis à jour dans ce dépôt.</p>
              </div>
              {returnType === 'client' && (
                <div className="space-y-1.5">
                  <Label htmlFor="return-client">Client</Label>
                  <Select
                    value={clientId}
                    onValueChange={(v) => {
                      setClientId(v)
                      // La vente choisie doit appartenir au client
                      if (orderId && !orders.some((o: any) => o.id === orderId && o.client_id === v)) setOrderId('')
                    }}
                  >
                    <SelectTrigger id="return-client" className="w-full"><SelectValue placeholder="Choisir un client" /></SelectTrigger>
                    <SelectContent>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {returnType === 'supplier' && (
                <div className="space-y-1.5">
                  <Label htmlFor="return-supplier">Fournisseur</Label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger id="return-supplier" className="w-full"><SelectValue placeholder="Choisir un fournisseur" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {returnType === 'client' && (
                <div className="space-y-1.5">
                  <Label htmlFor="return-order">Vente d&apos;origine <span className="font-normal text-muted-foreground">(facultatif)</span></Label>
                  <Select value={orderId || NO_ORDER} onValueChange={(v) => setOrderId(v === NO_ORDER ? '' : v)}>
                    <SelectTrigger id="return-order" className="w-full"><SelectValue placeholder="Choisir une vente" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ORDER}>Aucune</SelectItem>
                      {orderOptions.map(o => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.order_number}{o.client_name ? ` — ${o.client_name}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Le prix de cette vente est appliqué et la quantité est limitée à ce qui a été vendu.
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="return-reason">Motif général</Label>
              <Textarea id="return-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : casse à la livraison, produits périmés…" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Articles retournés</CardTitle>
            <CardDescription>Ajoutez chaque produit ou emballage avec sa quantité.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="item-type">Type d&apos;article</Label>
                <Select value={newItemType} onValueChange={(v) => { setNewItemType(v); setNewItemId('') }}>
                  <SelectTrigger id="item-type" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">Produit</SelectItem>
                    <SelectItem value="packaging">Emballage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-id">Article</Label>
                <Select value={newItemId} onValueChange={setNewItemId}>
                  <SelectTrigger id="item-id" className="w-full"><SelectValue placeholder="Choisir un article" /></SelectTrigger>
                  <SelectContent>
                    {newItemType === 'product'
                      ? variantOptions.map(v => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)
                      : packagings.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {newItemId && (
                  <p className="text-xs text-muted-foreground">
                    Prix indicatif : <span className="tabular">{formatMoney(indicativePrice(newItemType, newItemId))}</span>
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-qty">Quantité</Label>
                <Input id="item-qty" type="number" inputMode="numeric" min={1} step={1} value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} className="tabular" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-reason">Motif <span className="font-normal text-muted-foreground">(facultatif)</span></Label>
                <Input id="item-reason" value={newItemReason} onChange={(e) => setNewItemReason(e.target.value)} placeholder="Ex. : bouteille cassée" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={addItem} disabled={!newItemId || !newItemQty}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Ajouter l&apos;article
              </Button>
            </div>

            {items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Aucun article ajouté pour le moment.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <ul className="divide-y divide-border">
                  {items.map(item => (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{item.product_name || item.packaging_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.item_type === 'product' ? 'Produit' : 'Emballage'}
                          {item.reason ? ` · ${item.reason}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <div className="text-right">
                          <p className="tabular text-sm font-medium text-foreground">× {formatNumber(item.quantity)}</p>
                          <p className="tabular text-xs text-muted-foreground">{formatMoney(item.unit_price)} / u</p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(item.id)}
                          aria-label={`Retirer ${item.product_name || item.packaging_name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Total estimé</p>
                    <p className="text-xs text-muted-foreground">Le montant final est calculé par le serveur.</p>
                  </div>
                  <p className="tabular text-base font-semibold text-foreground">{formatMoney(estimatedTotal)}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => router.back()}>Annuler</Button>
          <Button variant="brand" onClick={handleSubmit} disabled={!depotId || items.length === 0 || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
            {submitting ? 'Enregistrement…' : 'Créer le retour'}
          </Button>
        </div>
      </PageShell>
    </div>
  )
}
