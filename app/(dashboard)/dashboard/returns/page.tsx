'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { RotateCcw, Loader2, CheckCircle2, XCircle, Plus } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch, toastError, toastWarnings } from '@/lib/api-client'
import { formatDateShort, formatMoney, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { PageShell, StatusBadge } from '@/components/app/blocks'
import { cn } from '@/lib/utils'

interface ReturnRecord {
  id: string; return_number: string; return_type: string; client_name: string | null
  supplier_name: string | null; order_number: string | null; depot_name: string | null
  status: string; total_amount: number; reason: string | null; items_count: number
  created_by_name: string | null; created_at: string
}

const fmt = formatMoney

const statusBadge: Record<string, { label: string; tone: 'warning' | 'info' | 'success' | 'danger' }> = {
  pending: { label: 'En attente', tone: 'warning' },
  approved: { label: 'Approuvé', tone: 'info' },
  processed: { label: 'Traité', tone: 'success' },
  rejected: { label: 'Rejeté', tone: 'danger' },
}

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [tab, setTab] = useState('all')
  const [loadError, setLoadError] = useState(false)
  const [confirm, setConfirm] = useState<{ record: ReturnRecord; action: 'approve' | 'reject' } | null>(null)

  const fetchData = useCallback(async () => {
    setLoadError(false)
    try {
      const json = await apiFetch('/api/returns')
      setReturns(json.data || [])
    } catch (e) {
      setLoadError(true)
      toastError(e, 'Impossible de charger les retours')
    }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleProcess(id: string, action: 'approve' | 'reject') {
    if (processing) return
    setProcessing(id)
    try {
      const res = await apiFetch(`/api/returns/${id}/process`, {
        method: 'POST',
        body: { action },
      })
      toast.success(res?.message || (action === 'approve' ? 'Retour traité' : 'Retour rejeté'))
      toastWarnings(res?.warnings)
      setConfirm(null)
      fetchData()
    } catch (e) {
      setConfirm(null)
      toastError(e, action === 'approve' ? 'Traitement impossible' : 'Rejet impossible')
    } finally { setProcessing(null) }
  }

  const filtered = tab === 'all' ? returns : returns.filter(r => r.return_type === tab)

  const typeFilters = [
    { value: 'all', label: 'Tous', count: returns.length },
    { value: 'client', label: 'Clients', count: returns.filter(r => r.return_type === 'client').length },
    { value: 'supplier', label: 'Fournisseurs', count: returns.filter(r => r.return_type === 'supplier').length },
  ]

  const newReturnButton = (
    <Button variant="brand" asChild>
      <Link href="/dashboard/returns/new">
        <Plus className="h-4 w-4" aria-hidden="true" />
        Nouveau retour
      </Link>
    </Button>
  )

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title="Retours" description="Produits et emballages rendus par les clients ou renvoyés aux fournisseurs" />
        <PageShell>
          <div className="rounded-xl border border-border bg-card p-4">
            <TableSkeleton rows={6} columns={6} />
          </div>
        </PageShell>
      </div>
    )
  }

  if (loadError && returns.length === 0) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title="Retours" description="Produits et emballages rendus par les clients ou renvoyés aux fournisseurs" />
        <PageShell>
          <ErrorState title="Impossible de charger les retours" onRetry={() => { setIsLoading(true); fetchData() }} />
        </PageShell>
      </div>
    )
  }

  const renderActions = (r: ReturnRecord) =>
    r.status === 'pending' ? (
      <div className="flex items-center justify-end gap-1">
        <Button size="sm" variant="outline" onClick={() => setConfirm({ record: r, action: 'approve' })} disabled={processing !== null}>
          {processing === r.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          Traiter
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => setConfirm({ record: r, action: 'reject' })}
          disabled={processing !== null}
          aria-label={`Rejeter le retour ${r.return_number}`}
        >
          <XCircle className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    ) : null

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title="Retours"
        description="Produits et emballages rendus par les clients ou renvoyés aux fournisseurs"
        actions={newReturnButton}
      />
      <PageShell>
        {/* Barre d'outils */}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par type de retour">
          {typeFilters.map((f) => {
            const active = tab === f.value
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setTab(f.value)}
                aria-pressed={active}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {f.label}
                <span className={cn('tabular text-xs', active ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{formatNumber(f.count)}</span>
              </button>
            )
          })}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={RotateCcw}
            title={tab === 'all' ? 'Aucun retour enregistré' : 'Aucun retour de ce type'}
            description="Enregistrez les produits ou emballages rendus par un client ou renvoyés à un fournisseur."
            action={{ label: 'Nouveau retour', href: '/dashboard/returns/new' }}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {/* Tableau (desktop) */}
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">N° retour</TableHead>
                    <TableHead>Client / fournisseur</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Commande</TableHead>
                    <TableHead className="text-right">Articles</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="pr-5"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const st = statusBadge[r.status] || statusBadge.pending
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="pl-5 font-mono text-sm font-medium text-foreground">{r.return_number}</TableCell>
                        <TableCell className="text-sm text-foreground">{r.client_name || r.supplier_name || '—'}</TableCell>
                        <TableCell>
                          <StatusBadge
                            label={r.return_type === 'client' ? 'Client' : 'Fournisseur'}
                            tone={r.return_type === 'client' ? 'brand' : 'info'}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">{r.order_number || '—'}</TableCell>
                        <TableCell className="tabular text-right text-sm">{formatNumber(r.items_count)}</TableCell>
                        <TableCell className="tabular text-right text-sm font-medium text-foreground">{fmt(Number(r.total_amount))}</TableCell>
                        <TableCell><StatusBadge label={st.label} tone={st.tone} /></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDateShort(r.created_at)}</TableCell>
                        <TableCell className="pr-5 text-right">{renderActions(r)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Cartes (mobile) */}
            <ul className="divide-y divide-border md:hidden">
              {filtered.map((r) => {
                const st = statusBadge[r.status] || statusBadge.pending
                return (
                  <li key={r.id} className="space-y-3 px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-medium text-foreground">{r.client_name || r.supplier_name || 'Sans nom'}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          <span className="font-mono">{r.return_number}</span> · {formatDateShort(r.created_at)} · {r.return_type === 'client' ? 'Client' : 'Fournisseur'}
                        </p>
                        <StatusBadge label={st.label} tone={st.tone} />
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular text-sm font-semibold text-foreground">{fmt(Number(r.total_amount))}</p>
                        <p className="tabular text-xs text-muted-foreground">
                          {formatNumber(r.items_count)} article{Number(r.items_count) > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    {r.status === 'pending' && renderActions(r)}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o && !processing) setConfirm(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirm?.action === 'approve' ? 'Traiter' : 'Rejeter'} le retour {confirm?.record.return_number} ?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm?.action === 'approve'
                  ? `Le stock et le compte ${confirm.record.return_type === 'client' ? 'du client' : 'fournisseur'} seront mis à jour (${fmt(Number(confirm.record.total_amount))}). Cette action est définitive.`
                  : 'Le retour sera rejeté : aucun mouvement de stock ni avoir ne sera créé. Cette action est définitive.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={processing !== null}>Revenir</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); if (confirm) handleProcess(confirm.record.id, confirm.action) }}
                disabled={processing !== null}
                className={confirm?.action === 'reject' ? 'bg-destructive text-white hover:bg-destructive/90' : ''}
              >
                {processing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {confirm?.action === 'approve' ? 'Oui, traiter' : 'Oui, rejeter'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageShell>
    </div>
  )
}
