'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ArrowLeftRight, ArrowRight, Loader2, CheckCircle2, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch, toastError, toastWarnings } from '@/lib/api-client'
import { formatDateShort, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { PageShell, StatusBadge } from '@/components/app/blocks'
import { cn } from '@/lib/utils'

interface Transfer {
  id: string; transfer_number: string; source_depot_name: string; destination_depot_name: string
  status: string; items_count: number; created_by_name: string | null; received_by_name: string | null
  created_at: string; received_at: string | null
}

const statusBadge: Record<string, { label: string; tone: 'warning' | 'brand' | 'success' | 'info' | 'default' }> = {
  pending: { label: 'En attente', tone: 'warning' },
  in_transit: { label: 'En transit', tone: 'info' },
  received: { label: 'Réceptionné', tone: 'success' },
  partial: { label: 'Partiel', tone: 'brand' },
  cancelled: { label: 'Annulé', tone: 'default' },
}

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [toReceive, setToReceive] = useState<Transfer | null>(null)
  const [receiving, setReceiving] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all')

  const fetchData = useCallback(async () => {
    setLoadError(false)
    try {
      const json = await apiFetch<{ data: Transfer[] }>('/api/transfers')
      setTransfers(json.data || [])
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleReceive() {
    if (!toReceive) return
    setReceiving(true)
    try {
      // items: [] → l'API considère que tout a été reçu tel qu'envoyé
      const res = await apiFetch<{ message?: string; warnings?: unknown }>(`/api/transfers/${toReceive.id}/receive`, {
        method: 'POST',
        body: { items: [] },
      })
      toast.success(res?.message || 'Transfert réceptionné')
      toastWarnings(res?.warnings)
      setToReceive(null)
    } catch (e) {
      toastError(e, 'Réception impossible')
      setToReceive(null)
    } finally {
      setReceiving(false)
      fetchData()
    }
  }

  const newButton = (
    <Button size="sm" variant="brand" className="h-9" asChild>
      <Link href="/dashboard/transfers/new">
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Nouveau transfert</span>
        <span className="sm:hidden">Nouveau</span>
      </Link>
    </Button>
  )

  const header = (
    <DashboardHeader
      title="Transferts inter-dépôts"
      description="Déplacements de stock entre vos dépôts"
      actions={newButton}
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

  const q = search.trim().toLowerCase()
  const isPending = (t: Transfer) => t.status === 'pending' || t.status === 'in_transit'
  const pendingCount = transfers.filter(isPending).length
  const visible = transfers.filter((t) => {
    if (filter === 'pending' && !isPending(t)) return false
    if (filter === 'done' && isPending(t)) return false
    if (!q) return true
    return [t.transfer_number, t.source_depot_name, t.destination_depot_name, t.created_by_name || '']
      .some((v) => v.toLowerCase().includes(q))
  })

  const FILTERS: { key: typeof filter; label: string; count?: number }[] = [
    { key: 'all', label: 'Tous', count: transfers.length },
    { key: 'pending', label: 'À réceptionner', count: pendingCount },
    { key: 'done', label: 'Clôturés' },
  ]

  const receiveButton = (t: Transfer, className?: string) => (
    <Button
      size="sm"
      variant="outline"
      className={cn('h-8', className)}
      disabled={receiving}
      onClick={() => setToReceive(t)}
    >
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      Réceptionner
    </Button>
  )

  return (
    <div className="flex min-h-screen flex-col">
      {header}
      <PageShell>
        {loadError ? (
          <ErrorState description="La liste des transferts n'a pas pu être chargée." onRetry={fetchData} />
        ) : transfers.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="Aucun transfert"
            description="Déplacez du stock d'un dépôt à un autre en créant un transfert."
            action={{ label: 'Nouveau transfert', href: '/dashboard/transfers/new' }}
          />
        ) : (
          <>
            {/* Barre d'outils */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="N°, dépôt, auteur…"
                  aria-label="Rechercher un transfert"
                  className="h-10 pl-9"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par statut">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    aria-pressed={filter === f.key}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      filter === f.key
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {f.label}
                    {f.count != null && <span className="tabular opacity-70">{formatNumber(f.count)}</span>}
                  </button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <EmptyState
                icon={Search}
                title="Aucun transfert ne correspond"
                description="Modifiez la recherche ou le filtre de statut."
                action={{ label: 'Réinitialiser', onClick: () => { setSearch(''); setFilter('all') } }}
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
                {/* Mobile : cartes */}
                <ul className="divide-y divide-border md:hidden">
                  {visible.map((t) => {
                    const st = statusBadge[t.status] || statusBadge.pending
                    return (
                      <li key={t.id} className="space-y-3 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="truncate text-sm font-medium text-foreground">{t.transfer_number}</p>
                            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                              <span className="truncate">{t.source_depot_name}</span>
                              <ArrowRight className="h-3 w-3 shrink-0" aria-label="vers" />
                              <span className="truncate">{t.destination_depot_name}</span>
                            </p>
                            <p className="tabular text-xs text-muted-foreground">
                              {formatDateShort(t.created_at)}{t.created_by_name ? ` · ${t.created_by_name}` : ''}
                            </p>
                          </div>
                          <div className="shrink-0 space-y-1 text-right">
                            <StatusBadge label={st.label} tone={st.tone} />
                            <p className="tabular text-xs text-muted-foreground">
                              {formatNumber(t.items_count)} article{t.items_count > 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        {isPending(t) && receiveButton(t, 'w-full')}
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
                        <TableHead>Trajet</TableHead>
                        <TableHead className="text-right">Articles</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Créé par</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="pr-5"><span className="sr-only">Actions</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((t) => {
                        const st = statusBadge[t.status] || statusBadge.pending
                        return (
                          <TableRow key={t.id} className="hover:bg-muted/40">
                            <TableCell className="pl-5 font-medium text-foreground">{t.transfer_number}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center gap-2">
                                <span>{t.source_depot_name}</span>
                                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-label="vers" />
                                <span>{t.destination_depot_name}</span>
                              </span>
                            </TableCell>
                            <TableCell className="tabular text-right">{formatNumber(t.items_count)}</TableCell>
                            <TableCell><StatusBadge label={st.label} tone={st.tone} /></TableCell>
                            <TableCell className="text-muted-foreground">{t.created_by_name || '—'}</TableCell>
                            <TableCell className="tabular text-muted-foreground">{formatDateShort(t.created_at)}</TableCell>
                            <TableCell className="pr-5 text-right">
                              {isPending(t) && receiveButton(t)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </>
        )}

        <AlertDialog open={!!toReceive} onOpenChange={(o) => { if (!o && !receiving) setToReceive(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Réceptionner le transfert {toReceive?.transfer_number} ?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    Toutes les quantités envoyées seront considérées comme reçues, sans perte ni casse.
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>
                      Dépôt source <strong className="font-medium text-foreground">{toReceive?.source_depot_name}</strong> : débité des quantités envoyées
                      {toReceive?.status === 'in_transit' ? ' (déjà fait pour un transfert en transit).' : '.'}
                    </li>
                    <li>
                      Dépôt destination <strong className="font-medium text-foreground">{toReceive?.destination_depot_name}</strong> : crédité de la totalité.
                    </li>
                  </ul>
                  <p>Cette opération est irréversible.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={receiving}>Annuler</AlertDialogCancel>
              <Button onClick={handleReceive} disabled={receiving}>
                {receiving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                Confirmer la réception
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageShell>
    </div>
  )
}
