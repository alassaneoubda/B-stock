'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { CalendarCheck, ClipboardList, Loader2, Plus, Eye, Download } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { apiFetch, toastError } from '@/lib/api-client'
import { formatDateShort, formatNumber, formatSignedMoney } from '@/lib/format'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { PageShell, Panel, StatusBadge } from '@/components/app/blocks'
import { cn } from '@/lib/utils'

interface InventorySession {
  id: string; session_number: string; inventory_type: string; depot_name: string
  status: string; total_items: number; items_with_variance: number
  total_variance_value: number; started_by_name: string; started_at: string
  completed_at: string | null
}

interface Depot { id: string; name: string }

const statusBadge: Record<string, { label: string; tone: 'brand' | 'success' | 'default' }> = {
  in_progress: { label: 'En cours', tone: 'brand' },
  completed: { label: 'Terminé', tone: 'success' },
  cancelled: { label: 'Annulé', tone: 'default' },
}

export default function InventoryPage() {
  const [sessions, setSessions] = useState<InventorySession[]>([])
  const [depots, setDepots] = useState<Depot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [newDepotId, setNewDepotId] = useState('')
  // Périmètre : complet, ou partiel (catégorie, marque, N articles les moins récemment comptés)
  const [newType, setNewType] = useState<'full' | 'category' | 'brand' | 'oldest'>('full')
  const [scopeValue, setScopeValue] = useState('')
  const [oldestCount, setOldestCount] = useState('20')
  const [facets, setFacets] = useState<{ categories: string[]; brands: string[] }>({ categories: [], brands: [] })
  const [submitting, setSubmitting] = useState(false)
  const [openNew, setOpenNew] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const router = useRouter()

  const fetchData = useCallback(async () => {
    setLoadError(false)
    try {
      const [invJson, depotJson] = await Promise.all([
        apiFetch<{ data: InventorySession[] }>('/api/inventory'),
        apiFetch<{ data: Depot[] }>('/api/depots'),
      ])
      setSessions(invJson.data || [])
      setDepots(Array.isArray(depotJson.data) ? depotJson.data : [])
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Catégories et marques proposées pour un inventaire partiel (chargées à l'ouverture du formulaire)
  useEffect(() => {
    if (!openNew) return
    apiFetch<{ data: { categories: string[]; brands: string[] } }>('/api/inventory/due')
      .then((res) => setFacets({ categories: res.data.categories ?? [], brands: res.data.brands ?? [] }))
      .catch(() => {})
  }, [openNew])

  const scopeReady =
    newType === 'full' ||
    ((newType === 'category' || newType === 'brand') && Boolean(scopeValue)) ||
    (newType === 'oldest' && Number(oldestCount) >= 1)

  async function handleCreate() {
    if (!newDepotId || submitting || !scopeReady) return
    setSubmitting(true)
    try {
      const scope =
        newType === 'category' ? { type: 'category', category: scopeValue }
        : newType === 'brand' ? { type: 'brand', brand: scopeValue }
        : newType === 'oldest' ? { type: 'oldest', limit: Math.min(500, Math.floor(Number(oldestCount))) }
        : { type: 'full' }
      const json = await apiFetch<{ data: { id: string } }>('/api/inventory', {
        method: 'POST',
        body: { depot_id: newDepotId, inventory_type: newType === 'full' ? 'full' : 'partial', scope },
      })
      toast.success('Inventaire démarré')
      setOpenNew(false)
      setNewDepotId('')
      router.push(`/dashboard/inventory/${json.data?.id || ''}`)
    } catch (e) {
      toastError(e, "Impossible de démarrer l'inventaire")
    } finally {
      setSubmitting(false)
    }
  }

  const newDialog = (
    <Dialog open={openNew} onOpenChange={setOpenNew}>
      <DialogTrigger asChild>
        <Button size="sm" variant="brand" className="h-9">
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Nouvel inventaire</span>
          <span className="sm:hidden">Nouveau</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Démarrer un inventaire</DialogTitle>
          <DialogDescription>Comptez le stock réel d&apos;un dépôt et comparez-le au stock enregistré.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="inventory-depot">Dépôt</Label>
            <Select value={newDepotId} onValueChange={setNewDepotId}>
              <SelectTrigger id="inventory-depot" className="h-10 w-full" aria-label="Dépôt">
                <SelectValue placeholder={depots.length ? 'Choisir un dépôt' : 'Aucun dépôt disponible'} />
              </SelectTrigger>
              <SelectContent>
                {depots.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inventory-type">Type</Label>
            <Select value={newType} onValueChange={(v) => { setNewType(v as typeof newType); setScopeValue('') }}>
              <SelectTrigger id="inventory-type" className="h-10 w-full" aria-label="Type d'inventaire"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Complet</SelectItem>
                <SelectItem value="category">Partiel — une catégorie</SelectItem>
                <SelectItem value="brand">Partiel — une marque</SelectItem>
                <SelectItem value="oldest">Partiel — les moins récemment comptés</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {newType === 'full'
                ? 'Un inventaire complet couvre tous les articles et emballages du dépôt.'
                : 'Un inventaire partiel ne compte que les articles choisis : le reste du stock n’est pas modifié.'}
            </p>
          </div>
          {(newType === 'category' || newType === 'brand') && (
            <div className="space-y-1.5">
              <Label htmlFor="inventory-scope">{newType === 'category' ? 'Catégorie' : 'Marque'}</Label>
              <Select value={scopeValue} onValueChange={setScopeValue}>
                <SelectTrigger id="inventory-scope" className="h-10 w-full">
                  <SelectValue placeholder="Choisir" />
                </SelectTrigger>
                <SelectContent>
                  {(newType === 'category' ? facets.categories : facets.brands).map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {newType === 'oldest' && (
            <div className="space-y-1.5">
              <Label htmlFor="inventory-oldest">Nombre d&apos;articles</Label>
              <Input
                id="inventory-oldest"
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                value={oldestCount}
                onChange={(e) => setOldestCount(e.target.value)}
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">Les articles jamais comptés passent en premier.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline" disabled={submitting}>Annuler</Button></DialogClose>
          <Button onClick={handleCreate} disabled={submitting || !newDepotId || !scopeReady}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ClipboardList className="h-4 w-4" aria-hidden="true" />}
            Démarrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const header = (
    <DashboardHeader
      title="Inventaire"
      description="Comptages physiques et écarts de stock par dépôt"
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-9" asChild>
            <Link href="/dashboard/inventory/due">
              <CalendarCheck className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">À compter cette semaine</span>
              <span className="sm:hidden">Cette semaine</span>
            </Link>
          </Button>
          {newDialog}
        </div>
      }
    />
  )

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        {header}
        <PageShell>
          <div className="rounded-xl border border-border bg-card p-5">
            <TableSkeleton rows={6} columns={6} />
          </div>
        </PageShell>
      </div>
    )
  }

  const inProgress = sessions.filter(s => s.status === 'in_progress').length
  const typeLabel = (t: string) => (t === 'full' ? 'Complet' : t === 'partial' ? 'Partiel' : 'Contrôle')
  const openSession = (id: string) => router.push(`/dashboard/inventory/${id}`)

  return (
    <div className="flex min-h-screen flex-col">
      {header}
      <PageShell>
        {loadError ? (
          <ErrorState description="La liste des inventaires n'a pas pu être chargée." onRetry={fetchData} />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Aucun inventaire"
            description="Démarrez un inventaire pour comparer le stock réel au stock enregistré."
            action={{ label: 'Nouvel inventaire', onClick: () => setOpenNew(true) }}
          />
        ) : (
          <Panel
            title="Inventaires"
            description={`${formatNumber(sessions.length)} inventaire${sessions.length > 1 ? 's' : ''}${inProgress > 0 ? ` · ${formatNumber(inProgress)} en cours` : ''}`}
          >
            {/* Mobile : cartes */}
            <ul className="divide-y divide-border md:hidden">
              {sessions.map((s) => {
                const st = statusBadge[s.status] || statusBadge.in_progress
                return (
                  <li key={s.id}>
                    <Link
                      href={`/dashboard/inventory/${s.id}`}
                      className="flex items-start justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-medium text-foreground">{s.session_number}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.depot_name} · {typeLabel(s.inventory_type)} · {formatDateShort(s.started_at)}
                        </p>
                        <StatusBadge label={st.label} tone={st.tone} />
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn('tabular text-sm font-medium', Number(s.total_variance_value) < 0 ? 'text-destructive' : 'text-foreground')}>
                          {s.status === 'completed' ? formatSignedMoney(s.total_variance_value) : '—'}
                        </p>
                        <p className="tabular text-xs text-muted-foreground">
                          {formatNumber(s.items_with_variance)} écart{s.items_with_variance > 1 ? 's' : ''} / {formatNumber(s.total_items)}
                        </p>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>

            {/* Bureau : tableau */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">N°</TableHead>
                    <TableHead>Dépôt</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Articles</TableHead>
                    <TableHead className="text-right">Écarts</TableHead>
                    <TableHead className="text-right">Valeur écarts</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="pr-5"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => {
                    const st = statusBadge[s.status] || statusBadge.in_progress
                    return (
                      <TableRow key={s.id} className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => openSession(s.id)}>
                        <TableCell className="pl-5 font-medium">
                          <Link href={`/dashboard/inventory/${s.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                            {s.session_number}
                          </Link>
                        </TableCell>
                        <TableCell>{s.depot_name}</TableCell>
                        <TableCell className="text-muted-foreground">{typeLabel(s.inventory_type)}</TableCell>
                        <TableCell className="tabular text-right">{formatNumber(s.total_items)}</TableCell>
                        <TableCell className={cn('tabular text-right', s.items_with_variance > 0 && 'font-medium text-destructive')}>
                          {formatNumber(s.items_with_variance)}
                        </TableCell>
                        <TableCell className={cn('tabular text-right', Number(s.total_variance_value) < 0 && 'text-destructive')}>
                          {s.status === 'completed' ? formatSignedMoney(s.total_variance_value) : '—'}
                        </TableCell>
                        <TableCell><StatusBadge label={st.label} tone={st.tone} /></TableCell>
                        <TableCell className="tabular text-muted-foreground">{formatDateShort(s.started_at)}</TableCell>
                        <TableCell className="pr-5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="outline" className="h-8" asChild>
                              <Link href={`/dashboard/inventory/${s.id}`}>
                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                {s.status === 'in_progress' ? 'Compter' : 'Voir'}
                              </Link>
                            </Button>
                            {s.status === 'completed' && (
                              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Télécharger le PDF de ${s.session_number}`} onClick={() => window.open(`/api/export/pdf?type=inventory&id=${s.id}`, '_blank')}>
                                <Download className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </Panel>
        )}
      </PageShell>
    </div>
  )
}
