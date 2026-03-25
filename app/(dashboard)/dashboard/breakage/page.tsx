'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { AlertTriangle, Loader2, Plus, CheckCircle2, XCircle, Package, TrendingDown } from 'lucide-react'

interface BreakageRecord {
  id: string; record_type: string; product_name: string | null; packaging_name: string | null
  quantity: number; unit_value: number; total_value: number; reason: string | null
  status: string; depot_name: string | null; reported_by_name: string | null; created_at: string
}

interface Stats {
  record_type: string; count: number; total_value: number
}

function fmt(n: number) { return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(n) + ' FCFA' }

const statusBadge: Record<string, { label: string; cls: string }> = {
  reported: { label: 'Signalé', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Approuvé', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rejeté', cls: 'bg-red-50 text-red-700 border-red-200' },
}

const typeLabels: Record<string, string> = {
  breakage: 'Casse',
  loss: 'Perte',
  expiry: 'Péremption',
  theft: 'Vol',
}

export default function BreakagePage() {
  const [records, setRecords] = useState<BreakageRecord[]>([])
  const [stats, setStats] = useState<Stats[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [openNew, setOpenNew] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const [newType, setNewType] = useState('breakage')
  const [newDepotId, setNewDepotId] = useState('')
  const [newProductId, setNewProductId] = useState('')
  const [newPackagingId, setNewPackagingId] = useState('')
  const [newQuantity, setNewQuantity] = useState('')
  const [newUnitValue, setNewUnitValue] = useState('')
  const [newReason, setNewReason] = useState('')
  const [depots, setDepots] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [packagings, setPackagings] = useState<any[]>([])

  const fetchData = useCallback(async () => {
    try {
      const [recRes, depotRes, prodRes, pkgRes] = await Promise.all([
        fetch('/api/breakage'),
        fetch('/api/depots'),
        fetch('/api/products'),
        fetch('/api/packaging-types'),
      ])
      if (!recRes.ok || !depotRes.ok || !prodRes.ok || !pkgRes.ok) {
        throw new Error('Failed to fetch data')
      }
      const recJson = await recRes.json()
      const depotJson = await depotRes.json()
      const prodJson = await prodRes.json()
      const pkgJson = await pkgRes.json()
      
      console.log('Depot response:', depotJson)
      console.log('Product response:', prodJson)
      console.log('Packaging response:', pkgJson)
      
      setRecords(recJson.data?.records || [])
      setStats(recJson.data?.stats || [])
      setDepots(Array.isArray(depotJson.data) ? depotJson.data : Array.isArray(depotJson) ? depotJson : [])
      setProducts(Array.isArray(prodJson.data) ? prodJson.data : Array.isArray(prodJson) ? prodJson : [])
      setPackagings(Array.isArray(pkgJson.data) ? pkgJson.data : Array.isArray(pkgJson) ? pkgJson : [])
    } catch (e) { 
      console.error('Error fetching data:', e)
      setDepots([])
      setProducts([])
      setPackagings([])
    }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleCreate() {
    if (!newType || !newQuantity) return
    const res = await fetch('/api/breakage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        record_type: newType,
        depot_id: newDepotId || undefined,
        product_variant_id: newProductId || undefined,
        packaging_type_id: newPackagingId || undefined,
        quantity: Number(newQuantity),
        unit_value: Number(newUnitValue) || 0,
        reason: newReason || undefined,
      }),
    })
    if (res.ok) {
      setOpenNew(false)
      setNewType('breakage'); setNewDepotId(''); setNewProductId(''); setNewPackagingId(''); setNewQuantity(''); setNewUnitValue(''); setNewReason('')
      fetchData()
    }
  }

  async function handleApprove(id: string, action: string) {
    setProcessing(id)
    try {
      await fetch(`/api/breakage/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      fetchData()
    } finally { setProcessing(null) }
  }

  const filtered = tab === 'all' ? records : records.filter(r => r.record_type === tab)

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Casse et Pertes" />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      <DashboardHeader title="Casse et Pertes" />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="text-xs text-zinc-500 mb-1">Total incidents</div>
            <div className="text-xl font-bold text-zinc-950">{records.length}</div>
          </Card>
          <Card className="p-4 border-red-200 bg-red-50/30">
            <div className="flex items-center gap-1 text-xs text-red-600 mb-1"><TrendingDown className="h-3 w-3" /> Valeur totale</div>
            <div className="text-xl font-bold text-red-600">{fmt(records.reduce((s, r) => s + Number(r.total_value), 0))}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-zinc-500 mb-1">Ce mois</div>
            <div className="text-xl font-bold text-amber-600">{fmt(stats.reduce((s, st) => s + Number(st.total_value), 0))}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-zinc-500 mb-1">En attente</div>
            <div className="text-xl font-bold text-amber-600">{records.filter(r => r.status === 'reported').length}</div>
          </Card>
        </div>

        <div className="flex items-center justify-between">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="all">Tous ({records.length})</TabsTrigger>
              {Object.entries(typeLabels).map(([key, label]) => (
                <TabsTrigger key={key} value={key}>
                  {label} ({records.filter(r => r.record_type === key).length})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Signaler</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Signaler une casse/perte</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Type</Label>
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(typeLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Dépôt</Label>
                  <Select value={newDepotId} onValueChange={setNewDepotId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir un dépôt" /></SelectTrigger>
                    <SelectContent>
                      {depots.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Produit</Label>
                  <Select value={newProductId} onValueChange={setNewProductId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir un produit" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Quantité</Label>
                    <Input type="number" value={newQuantity} onChange={(e) => setNewQuantity(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label>Valeur unitaire (FCFA)</Label>
                    <Input type="number" value={newUnitValue} onChange={(e) => setNewUnitValue(e.target.value)} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Raison</Label>
                  <Input value={newReason} onChange={(e) => setNewReason(e.target.value)} className="mt-1" placeholder="Cause..." />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
                <Button onClick={handleCreate} disabled={!newType || !newQuantity}>
                  <AlertTriangle className="h-4 w-4 mr-2" /> Signaler
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">Aucun incident</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Article</TableHead>
                    <TableHead>Dépôt</TableHead>
                    <TableHead className="text-center">Quantité</TableHead>
                    <TableHead className="text-right">Valeur</TableHead>
                    <TableHead>Raison</TableHead>
                    <TableHead>Signalé par</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const st = statusBadge[r.status] || statusBadge.reported
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Badge variant="outline" className="border-red-200 text-red-700">
                            {typeLabels[r.record_type] || r.record_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{r.product_name || r.packaging_name || '-'}</TableCell>
                        <TableCell className="text-sm">{r.depot_name || '-'}</TableCell>
                        <TableCell className="text-center text-sm">{r.quantity}</TableCell>
                        <TableCell className="text-right text-sm font-medium text-red-600">{fmt(Number(r.total_value))}</TableCell>
                        <TableCell className="text-sm text-zinc-600">{r.reason || '-'}</TableCell>
                        <TableCell className="text-sm text-zinc-500">{r.reported_by_name || '-'}</TableCell>
                        <TableCell><Badge variant="outline" className={st.cls}>{st.label}</Badge></TableCell>
                        <TableCell>
                          {r.status === 'reported' && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600" onClick={() => handleApprove(r.id, 'approve')} disabled={processing === r.id}>
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Approuver
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => handleApprove(r.id, 'reject')} disabled={processing === r.id}>
                                <XCircle className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
