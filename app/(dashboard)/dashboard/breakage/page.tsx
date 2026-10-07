'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AlertTriangle, Loader2, Plus, CheckCircle2, XCircle, TrendingDown } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, toastError, toastWarnings } from '@/lib/api-client'
import { formatMoney, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'

interface BreakageRecord {
  id: string; record_type: string; product_name: string | null; packaging_name: string | null
  quantity: number; unit_value: number; total_value: number; reason: string | null
  status: string; depot_name: string | null; reported_by_name: string | null; created_at: string
}

interface Stats {
  record_type: string; count: number; total_value: number
}

const NO_PRODUCT = '__none__'

const statusBadge: Record<string, { label: string; cls: string }> = {
  reported: { label: 'Signalé', cls: 'bg-warning-soft text-warning-foreground border-warning/30' },
  approved: { label: 'Approuvé', cls: 'bg-success-soft text-success border-success/30' },
  rejected: { label: 'Rejeté', cls: 'bg-destructive/10 text-destructive border-destructive/30' },
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
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState('all')
  const [openNew, setOpenNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [processing, setProcessing] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<{ record: BreakageRecord; action: 'approve' | 'reject' } | null>(null)
  const [newType, setNewType] = useState('breakage')
  const [newDepotId, setNewDepotId] = useState('')
  const [newProductId, setNewProductId] = useState('')
  const [newPackagingId, setNewPackagingId] = useState('')
  const [newQuantity, setNewQuantity] = useState('')
  const [newUnitValue, setNewUnitValue] = useState('')
  const [newReason, setNewReason] = useState('')
  const [depots, setDepots] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])

  const fetchData = useCallback(async () => {
    setLoadError(false)
    try {
      const [recJson, depotJson, prodJson] = await Promise.all([
        apiFetch<{ data: { records: BreakageRecord[]; stats: Stats[] } }>('/api/breakage'),
        apiFetch<{ data: any[] }>('/api/depots'),
        apiFetch<{ data: any[] }>('/api/products'),
      ])

      setRecords(recJson.data?.records || [])
      setStats(recJson.data?.stats || [])
      setDepots(Array.isArray(depotJson.data) ? depotJson.data : [])
      const productList = Array.isArray(prodJson.data) ? prodJson.data : []
      // L'API attend des identifiants de variante (produit + conditionnement), pas de produit.
      setProducts(productList.flatMap((p: any) =>
        (Array.isArray(p.variants) ? p.variants : []).map((v: any) => ({
          id: v.id,
          name: v.packaging_name ? `${p.name} — ${v.packaging_name}` : p.name,
        }))
      ))
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const hasItem = !!newProductId || !!newPackagingId

  function resetForm() {
    setNewType('breakage'); setNewDepotId(''); setNewProductId(''); setNewPackagingId('')
    setNewQuantity(''); setNewUnitValue(''); setNewReason(''); setFormError(null)
  }

  async function handleCreate() {
    if (!newType || !newQuantity || creating) return
    const quantity = Number(newQuantity)
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setFormError('La quantité doit être un nombre entier positif.')
      return
    }
    const unitValue = newUnitValue === '' ? 0 : Number(newUnitValue)
    if (!Number.isFinite(unitValue) || unitValue < 0) {
      setFormError('La valeur unitaire doit être un montant positif.')
      return
    }
    // Le stock sera déduit d'un dépôt précis à l'approbation : obligatoire dès qu'un article est choisi
    if (hasItem && !newDepotId) {
      setFormError('Veuillez choisir le dépôt concerné.')
      return
    }
    setFormError(null)
    setCreating(true)
    try {
      const res = await apiFetch<{ warnings?: unknown }>('/api/breakage', {
        method: 'POST',
        body: {
          record_type: newType,
          depot_id: newDepotId || undefined,
          product_variant_id: newProductId || undefined,
          packaging_type_id: newPackagingId || undefined,
          quantity,
          unit_value: unitValue,
          reason: newReason || undefined,
        },
      })
      toast.success('Incident signalé')
      toastWarnings(res?.warnings)
      setOpenNew(false)
      resetForm()
      fetchData()
    } catch (e) {
      toastError(e, 'Signalement impossible')
    } finally {
      setCreating(false)
    }
  }

  async function handleApprove() {
    if (!pendingAction) return
    const { record, action } = pendingAction
    setProcessing(record.id)
    try {
      const res = await apiFetch<{ message?: string; warnings?: unknown }>(`/api/breakage/${record.id}/approve`, {
        method: 'POST',
        body: { action },
      })
      toast.success(res?.message || (action === 'approve' ? 'Approuvé et stock ajusté' : 'Rejeté'))
      toastWarnings(res?.warnings)
    } catch (e) {
      // 409 : stock insuffisant ou incident déjà traité → message du serveur
      toastError(e, action === 'approve' ? 'Approbation impossible' : 'Rejet impossible')
    } finally {
      setProcessing(null)
      setPendingAction(null)
      fetchData()
    }
  }

  const filtered = tab === 'all' ? records : records.filter(r => r.record_type === tab)

  if (isLoading) {
    return <PageSkeleton />
  }

  if (loadError) {
    return (
      <div className="flex flex-col min-h-screen bg-muted/30">
        <DashboardHeader title="Casse et Pertes" />
        <main className="flex-1 p-4 lg:p-6 max-w-[1400px] mx-auto w-full">
          <ErrorState description="Les incidents n'ont pas pu être chargés." onRetry={fetchData} />
        </main>
      </div>
    )
  }

  const pendingRecord = pendingAction?.record
  const pendingItemName = pendingRecord ? (pendingRecord.product_name || pendingRecord.packaging_name) : null

  return (
    <div className="flex flex-col min-h-screen bg-muted/30">
      <DashboardHeader title="Casse et Pertes" />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Total incidents</div>
            <div className="text-xl font-bold text-foreground">{formatNumber(records.length)}</div>
          </Card>
          <Card className="p-4 border-destructive/30 bg-destructive/10">
            <div className="flex items-center gap-1 text-xs text-destructive mb-1"><TrendingDown className="h-3 w-3" aria-hidden="true" /> Valeur totale</div>
            <div className="text-xl font-bold text-destructive">{formatMoney(records.reduce((s, r) => s + Number(r.total_value), 0))}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Ce mois</div>
            <div className="text-xl font-bold text-warning-foreground">{formatMoney(stats.reduce((s, st) => s + Number(st.total_value), 0))}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">En attente</div>
            <div className="text-xl font-bold text-warning-foreground">{formatNumber(records.filter(r => r.status === 'reported').length)}</div>
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
          <Dialog open={openNew} onOpenChange={(o) => { if (!creating) { setOpenNew(o); if (!o) setFormError(null) } }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Signaler</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Signaler une casse/perte</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Type</Label>
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger className="mt-1" aria-label="Type d'incident"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(typeLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Produit</Label>
                  <Select
                    value={newProductId || NO_PRODUCT}
                    onValueChange={(v) => { setNewProductId(v === NO_PRODUCT ? '' : v); setNewPackagingId(''); setFormError(null) }}
                  >
                    <SelectTrigger className="mt-1" aria-label="Produit"><SelectValue placeholder="Choisir un produit" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PRODUCT}>Aucun produit (valeur seule)</SelectItem>
                      {products.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>
                    Dépôt{hasItem && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select value={newDepotId} onValueChange={(v) => { setNewDepotId(v); setFormError(null) }}>
                    <SelectTrigger
                      className="mt-1"
                      aria-label="Dépôt"
                      aria-required={hasItem}
                      aria-invalid={hasItem && !newDepotId && !!formError}
                    >
                      <SelectValue placeholder="Choisir un dépôt" />
                    </SelectTrigger>
                    <SelectContent>
                      {depots.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {hasItem && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Obligatoire : le stock de ce dépôt sera diminué à l&apos;approbation.
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="breakage-qty">Quantité</Label>
                    <Input id="breakage-qty" type="number" min={1} step={1} inputMode="numeric" value={newQuantity} onChange={(e) => { setNewQuantity(e.target.value); setFormError(null) }} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="breakage-unit-value">Valeur unitaire (FCFA)</Label>
                    <Input id="breakage-unit-value" type="number" min={0} inputMode="numeric" value={newUnitValue} onChange={(e) => { setNewUnitValue(e.target.value); setFormError(null) }} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="breakage-reason">Raison</Label>
                  <Input id="breakage-reason" value={newReason} onChange={(e) => setNewReason(e.target.value)} className="mt-1" placeholder="Cause..." />
                </div>
                {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline" disabled={creating}>Annuler</Button></DialogClose>
                <Button onClick={handleCreate} disabled={creating || !newType || !newQuantity || (hasItem && !newDepotId)}>
                  {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <AlertTriangle className="h-4 w-4 mr-2" />} Signaler
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <EmptyState
                className="m-4"
                icon={AlertTriangle}
                title="Aucun incident"
                description={tab === 'all' ? 'Aucune casse ni perte signalée pour le moment.' : `Aucun incident de type « ${typeLabels[tab] ?? tab} ».`}
                action={tab === 'all' ? { label: 'Signaler un incident', onClick: () => setOpenNew(true) } : undefined}
              />
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
                    <TableHead><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const st = statusBadge[r.status] || statusBadge.reported
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Badge variant="outline" className="border-destructive/30 text-destructive">
                            {typeLabels[r.record_type] || r.record_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{r.product_name || r.packaging_name || '-'}</TableCell>
                        <TableCell className="text-sm">{r.depot_name || '-'}</TableCell>
                        <TableCell className="text-center text-sm">{formatNumber(r.quantity)}</TableCell>
                        <TableCell className="text-right text-sm font-medium text-destructive">{formatMoney(r.total_value)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.reason || '-'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.reported_by_name || '-'}</TableCell>
                        <TableCell><Badge variant="outline" className={st.cls}>{st.label}</Badge></TableCell>
                        <TableCell>
                          {r.status === 'reported' && (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-success"
                                onClick={() => setPendingAction({ record: r, action: 'approve' })}
                                disabled={processing === r.id}
                              >
                                {processing === r.id && pendingAction?.action === 'approve'
                                  ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  : <CheckCircle2 className="h-3 w-3 mr-1" />} Approuver
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-destructive"
                                aria-label="Rejeter l'incident"
                                title="Rejeter"
                                onClick={() => setPendingAction({ record: r, action: 'reject' })}
                                disabled={processing === r.id}
                              >
                                {processing === r.id && pendingAction?.action === 'reject'
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <XCircle className="h-3 w-3" aria-hidden="true" />}
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

        {/* Confirmation approbation / rejet */}
        <AlertDialog open={!!pendingAction} onOpenChange={(o) => { if (!o && !processing) setPendingAction(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pendingAction?.action === 'approve' ? "Approuver l'incident ?" : "Rejeter l'incident ?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pendingAction?.action === 'approve'
                  ? pendingItemName
                    ? `${formatNumber(pendingRecord?.quantity)} × ${pendingItemName} seront retirés du stock du dépôt ${pendingRecord?.depot_name ?? ''} (perte de ${formatMoney(pendingRecord?.total_value)}). Cette opération est irréversible.`
                    : `La perte de ${formatMoney(pendingRecord?.total_value)} sera validée. Aucun article n'est associé : le stock ne change pas.`
                  : "L'incident sera marqué comme rejeté. Le stock ne sera pas modifié."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={!!processing}>Annuler</AlertDialogCancel>
              <Button
                onClick={handleApprove}
                disabled={!!processing}
                variant={pendingAction?.action === 'reject' ? 'destructive' : 'default'}
              >
                {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {pendingAction?.action === 'approve' ? 'Approuver' : 'Rejeter'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  )
}
