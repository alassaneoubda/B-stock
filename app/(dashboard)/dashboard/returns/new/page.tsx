'use client'

import { useState, useEffect } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Plus, Trash2, Loader2, RotateCcw } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ReturnItem {
  id: string; item_type: string; product_variant_id?: string; packaging_type_id?: string
  quantity: number; reason: string; product_name?: string; packaging_name?: string
}

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
  const [newItemType, setNewItemType] = useState('product')
  const [newItemId, setNewItemId] = useState('')
  const [newItemQty, setNewItemQty] = useState('')
  const [newItemReason, setNewItemReason] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/clients'),
      fetch('/api/suppliers'),
      fetch('/api/sales'),
      fetch('/api/depots'),
      fetch('/api/products'),
      fetch('/api/packaging-types'),
    ]).then(async ([clientRes, supplierRes, orderRes, depotRes, prodRes, pkgRes]) => {
      const clientJson = await clientRes.json()
      const supplierJson = await supplierRes.json()
      const orderJson = await orderRes.json()
      const depotJson = await depotRes.json()
      const prodJson = await prodRes.json()
      const pkgJson = await pkgRes.json()
      setClients(Array.isArray(clientJson.data) ? clientJson.data : [])
      setSuppliers(Array.isArray(supplierJson.data) ? supplierJson.data : [])
      setOrders(Array.isArray(orderJson.data) ? orderJson.data : [])
      setDepots(Array.isArray(depotJson.data) ? depotJson.data : Array.isArray(depotJson) ? depotJson : [])
      setProducts(Array.isArray(prodJson.data) ? prodJson.data : Array.isArray(prodJson) ? prodJson : [])
      setPackagings(Array.isArray(pkgJson.data) ? pkgJson.data : Array.isArray(pkgJson) ? pkgJson : [])
    })
  }, [])

  function addItem() {
    if (!newItemId || !newItemQty) return
    const item = newItemType === 'product' 
      ? products.find((p: any) => p.id === newItemId)
      : packagings.find((p: any) => p.id === newItemId)
    if (!item) return
    
    // Get unit price from item data
    let unitPrice = 0
    if (newItemType === 'product' && item.variants && item.variants.length > 0) {
      unitPrice = item.variants[0].price || 0
    } else if (newItemType === 'packaging') {
      unitPrice = item.deposit_price || 0
    }
    
    setItems([...items, {
      id: Date.now().toString(),
      item_type: newItemType,
      [newItemType === 'product' ? 'product_variant_id' : 'packaging_type_id']: newItemId,
      quantity: Number(newItemQty),
      unit_price: unitPrice,
      reason: newItemReason,
      [newItemType === 'product' ? 'product_name' : 'packaging_name']: item.name,
    }])
    setNewItemId(''); setNewItemQty(''); setNewItemReason('')
  }

  function removeItem(id: string) {
    setItems(items.filter(i => i.id !== id))
  }

  async function handleSubmit() {
    if (!depotId || items.length === 0) return
    const payload = {
      return_type: returnType,
      depot_id: depotId,
      reason,
      items: items.map(({ id, ...item }) => item),
      ...(returnType === 'client' && { client_id: clientId }),
      ...(returnType === 'supplier' && { supplier_id: supplierId }),
      ...(orderId && { order_id: orderId }),
    }
    setSubmitting(true)
    try {
      await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      router.push('/dashboard/returns')
    } finally { setSubmitting(false) }
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
                <Select value={returnType} onValueChange={setReturnType}>
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
                  <Select value={clientId} onValueChange={setClientId}>
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
              <div>
                <Label>Commande (optionnel)</Label>
                <Select value={orderId} onValueChange={setOrderId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>
                    {orders.map(o => <SelectItem key={o.id} value={o.id}>{o.order_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
                <Select value={newItemType} onValueChange={setNewItemType}>
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
                    {(newItemType === 'product' ? products : packagings).map(item => (
                      <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantité</Label>
                <Input type="number" value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} className="mt-1" />
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
                      <div className="text-sm text-zinc-500">Qté: {item.quantity} • {item.reason}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => removeItem(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
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
