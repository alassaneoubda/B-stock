'use client'

import { useState, useEffect } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Plus, Trash2, Loader2, ArrowLeftRight } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface TransferItem {
  id: string; item_type: string; product_variant_id?: string; packaging_type_id?: string
  quantity: number; product_name?: string; packaging_name?: string
  available_stock?: number
}

interface StockInfo {
  product_variant_id: string; quantity: number
}

interface PackagingStockInfo {
  packaging_type_id: string; quantity: number
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

  // Fetch stock info when source depot changes
  useEffect(() => {
    if (!sourceDepotId) return
    
    Promise.all([
      fetch(`/api/stock?depotId=${sourceDepotId}`),
      fetch(`/api/packaging/stock?depotId=${sourceDepotId}`),
    ]).then(async ([stockRes, pkgStockRes]) => {
      const stockJson = await stockRes.json()
      const pkgStockJson = await pkgStockRes.json()
      setStockInfo(Array.isArray(stockJson.data) ? stockJson.data : [])
      setPackagingStockInfo(Array.isArray(pkgStockJson.data) ? pkgStockJson.data : [])
    }).catch((error) => console.error('Error fetching stock:', error))
  }, [sourceDepotId])

  useEffect(() => {
    Promise.all([
      fetch('/api/depots'),
      fetch('/api/products'),
      fetch('/api/packaging-types'),
    ]).then(async ([depotRes, prodRes, pkgRes]) => {
      const depotJson = await depotRes.json()
      const prodJson = await prodRes.json()
      const pkgJson = await pkgRes.json()
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
    
    const availableStock = newItemType === 'product'
      ? stockInfo.find((s: StockInfo) => s.product_variant_id === newItemId)?.quantity || 0
      : packagingStockInfo.find((s: PackagingStockInfo) => s.packaging_type_id === newItemId)?.quantity || 0
    
    const quantity = Number(newItemQty)
    if (quantity > availableStock) {
      alert(`Quantité supérieure au stock disponible (${availableStock})`)
      return
    }
    
    setItems([...items, {
      id: Date.now().toString(),
      item_type: newItemType,
      [newItemType === 'product' ? 'product_variant_id' : 'packaging_type_id']: newItemId,
      quantity,
      [newItemType === 'product' ? 'product_name' : 'packaging_name']: item.name,
      available_stock: availableStock,
    }])
    setNewItemId(''); setNewItemQty('')
  }

  function removeItem(id: string) {
    setItems(items.filter(i => i.id !== id))
  }

  async function handleSubmit() {
    if (!sourceDepotId || !destDepotId || items.length === 0) return
    setSubmitting(true)
    try {
      await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_depot_id: sourceDepotId,
          destination_depot_id: destDepotId,
          items: items.map(({ id, ...item }) => item),
        }),
      })
      router.push('/dashboard/transfers')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
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
                <Label>Dépôt source</Label>
                <Select value={sourceDepotId} onValueChange={setSourceDepotId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>
                    {depots.map(d => (
                      <SelectItem key={d.id} value={d.id} disabled={d.id === destDepotId}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Dépôt destination</Label>
                <Select value={destDepotId} onValueChange={setDestDepotId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>
                    {depots.map(d => (
                      <SelectItem key={d.id} value={d.id} disabled={d.id === sourceDepotId}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Articles à transférer</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                        Qté: {item.quantity} • Disponible: {item.available_stock || 0}
                      </div>
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
          <Button onClick={handleSubmit} disabled={!sourceDepotId || !destDepotId || items.length === 0 || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowLeftRight className="h-4 w-4 mr-2" />}
            Créer le transfert
          </Button>
        </div>
      </main>
    </div>
  )
}
