'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AlertTriangle, CalendarDays, Clock, Loader2, Plus, CheckCircle2, XCircle, TrendingDown } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, toastError, toastWarnings } from '@/lib/api-client'
import { formatMoney, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'
import { PageShell, StatCard, StatusBadge } from '@/components/app/blocks'
import { cn } from '@/lib/utils'

interface BreakageRecord {
  id: string; record_type: string; product_name: string | null; packaging_name: string | null
  quantity: number; unit_value: number; total_value: number; reason: string | null
  status: string; depot_name: string | null; reported_by_name: string | null; created_at: string
}

interface Stats {
  record_type: string; count: number; total_value: number
}

const NO_PRODUCT = '__none__'

const statusBadge: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  reported: { label: 'Signalé', tone: 'warning' },
  approved: { label: 'Approuvé', tone: 'success' },
  rejected: { label: 'Rejeté', tone: 'danger' },
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

  const newDialog = (
    <Dialog open={openNew} onOpenChange={(o) => { if (!creating) { setOpenNew(o); if (!o) setFormError(null) } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="brand" className="h-9">
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Signaler un incident</span>
          <span className="sm:hidden">Signaler</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Signaler une casse ou une perte</DialogTitle>
          <DialogDescription>Le stock n&apos;est ajusté qu&apos;après approbation de l&apos;incident.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="breakage-type">Type</Label>
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger id="breakage-type" className="h-10 w-full" aria-label="Type d'incident"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(typeLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="breakage-product">Produit</Label>
            <Select
              value={newProductId || NO_PRODUCT}
              onValueChange={(v) => { setNewProductId(v === NO_PRODUCT ? '' : v); setNewPackagingId(''); setFormError(null) }}
            >
              <SelectTrigger id="breakage-product" className="h-10 w-full" aria-label="Produit"><SelectValue placeholder="Choisir un produit" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PRODUCT}>Aucun produit (valeur seule)</SelectItem>
                {products.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="breakage-depot">
              Dépôt{hasItem && <span className="text-destructive" aria-hidden="true"> *</span>}
            </Label>
            <Select value={newDepotId} onValueChange={(v) => { setNewDepotId(v); setFormError(null) }}>
              <SelectTrigger
                id="breakage-depot"
                className="h-10 w-full"
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
              <p className="text-xs text-muted-foreground">
                Obligatoire : le stock de ce dépôt sera diminué à l&apos;approbation.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="breakage-qty">Quantité</Label>
            <Input id="breakage-qty" type="number" min={1} step={1} inputMode="numeric" value={newQuantity} onChange={(e) => { setNewQuantity(e.target.value); setFormError(null) }} className="tabular h-10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="breakage-unit-value">Valeur unitaire (FCFA)</Label>
            <Input id="breakage-unit-value" type="number" min={0} inputMode="numeric" value={newUnitValue} onChange={(e) => { setNewUnitValue(e.target.value); setFormError(null) }} className="tabular h-10" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="breakage-reason">Raison</Label>
            <Input id="breakage-reason" value={newReason} onChange={(e) => setNewReason(e.target.value)} className="h-10" placeholder="Cause…" />
          </div>
          {formError && <p role="alert" className="text-sm text-destructive sm:col-span-2">{formError}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline" disabled={creating}>Annuler</Button></DialogClose>
          <Button onClick={handleCreate} disabled={creating || !newType || !newQuantity || (hasItem && !newDepotId)}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
            Signaler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const header = (
    <DashboardHeader
      title="Casse et pertes"
      description="Incidents de stock à valider : casse, perte, péremption, vol"
      actions={newDialog}
    />
  )

  if (isLoading) {
    return <PageSkeleton />
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col">
        {header}
        <PageShell>
          <ErrorState description="Les incidents n'ont pas pu être chargés." onRetry={fetchData} />
        </PageShell>
      </div>
    )
  }

  const pendingRecord = pendingAction?.record
  const pendingItemName = pendingRecord ? (pendingRecord.product_name || pendingRecord.packaging_name) : null
  const pendingCount = records.filter(r => r.status === 'reported').length

  const FILTERS = [
    { key: 'all', label: 'Tous', count: records.length },
    ...Object.entries(typeLabels).map(([key, label]) => ({
      key,
      label,
      count: records.filter(r => r.record_type === key).length,
    })),
  ]

  const actionButtons = (r: BreakageRecord, className?: string) => (
    <div className={cn('flex items-center justify-end gap-1', className)}>
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        onClick={() => setPendingAction({ record: r, action: 'approve' })}
        disabled={processing === r.id}
      >
        {processing === r.id && pendingAction?.action === 'approve'
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          : <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />}
        Approuver
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        aria-label="Rejeter l'incident"
        title="Rejeter"
        onClick={() => setPendingAction({ record: r, action: 'reject' })}
        disabled={processing === r.id}
      >
        {processing === r.id && pendingAction?.action === 'reject'
          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          : <XCircle className="h-4 w-4" aria-hidden="true" />}
      </Button>
    </div>
  )

  return (
    <div className="flex min-h-screen flex-col">
      {header}
      <PageShell>
        {/* Indicateurs */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total incidents" value={formatNumber(records.length)} icon={AlertTriangle} />
          <StatCard
            label="Valeur totale"
            value={formatMoney(records.reduce((s, r) => s + Number(r.total_value), 0))}
            icon={TrendingDown}
            tone="danger"
          />
          <StatCard label="Ce mois" value={formatMoney(stats.reduce((s, st) => s + Number(st.total_value), 0))} icon={CalendarDays} />
          <StatCard
            label="À valider"
            value={formatNumber(pendingCount)}
            hint={pendingCount > 0 ? 'Incidents en attente d’approbation' : 'Rien en attente'}
            icon={Clock}
            tone={pendingCount > 0 ? 'warning' : 'default'}
          />
        </div>

        {/* Filtres par type */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par type d'incident">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setTab(f.key)}
              aria-pressed={tab === f.key}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                tab === f.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {f.label}
              <span className="tabular opacity-70">{formatNumber(f.count)}</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="Aucun incident"
            description={tab === 'all' ? 'Aucune casse ni perte signalée pour le moment.' : `Aucun incident de type « ${typeLabels[tab] ?? tab} ».`}
            action={tab === 'all' ? { label: 'Signaler un incident', onClick: () => setOpenNew(true) } : undefined}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
            {/* Mobile : cartes */}
            <ul className="divide-y divide-border md:hidden">
              {filtered.map((r) => {
                const st = statusBadge[r.status] || statusBadge.reported
                return (
                  <li key={r.id} className="space-y-3 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-medium text-foreground">{r.product_name || r.packaging_name || 'Sans article'}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {typeLabels[r.record_type] || r.record_type}
                          {r.depot_name ? ` · ${r.depot_name}` : ''}
                          {r.reported_by_name ? ` · ${r.reported_by_name}` : ''}
                        </p>
                        {r.reason && <p className="line-clamp-2 text-xs text-muted-foreground">{r.reason}</p>}
                      </div>
                      <div className="shrink-0 space-y-1 text-right">
                        <p className="tabular text-sm font-semibold text-destructive">{formatMoney(r.total_value)}</p>
                        <p className="tabular text-xs text-muted-foreground">Qté {formatNumber(r.quantity)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge label={st.label} tone={st.tone} />
                      {r.status === 'reported' && actionButtons(r)}
                    </div>
                  </li>
                )
              })}
            </ul>

            {/* Bureau : tableau */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Article</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dépôt</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="text-right">Valeur</TableHead>
                    <TableHead>Raison</TableHead>
                    <TableHead>Signalé par</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="pr-5"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const st = statusBadge[r.status] || statusBadge.reported
                    return (
                      <TableRow key={r.id} className="hover:bg-muted/40">
                        <TableCell className="pl-5 font-medium text-foreground">{r.product_name || r.packaging_name || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{typeLabels[r.record_type] || r.record_type}</TableCell>
                        <TableCell>{r.depot_name || '—'}</TableCell>
                        <TableCell className="tabular text-right">{formatNumber(r.quantity)}</TableCell>
                        <TableCell className="tabular text-right font-medium text-destructive">{formatMoney(r.total_value)}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-muted-foreground" title={r.reason || undefined}>{r.reason || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{r.reported_by_name || '—'}</TableCell>
                        <TableCell><StatusBadge label={st.label} tone={st.tone} /></TableCell>
                        <TableCell className="pr-5">
                          {r.status === 'reported' && actionButtons(r)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

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
                {processing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {pendingAction?.action === 'approve' ? 'Approuver' : 'Rejeter'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageShell>
    </div>
  )
}
