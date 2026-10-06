'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { RotateCcw, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch, toastError, toastWarnings } from '@/lib/api-client'
import { formatDateShort, formatMoney, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'

interface ReturnRecord {
  id: string; return_number: string; return_type: string; client_name: string | null
  supplier_name: string | null; order_number: string | null; depot_name: string | null
  status: string; total_amount: number; reason: string | null; items_count: number
  created_by_name: string | null; created_at: string
}

const fmt = formatMoney

const statusBadge: Record<string, { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Approuvé', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  processed: { label: 'Traité', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rejeté', cls: 'bg-red-50 text-red-700 border-red-200' },
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

  if (isLoading) {
    return <PageSkeleton />
  }

  if (loadError && returns.length === 0) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Gestion des Retours" />
        <main className="flex-1 p-4 lg:p-6">
          <ErrorState title="Impossible de charger les retours" onRetry={() => { setIsLoading(true); fetchData() }} />
        </main>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      <DashboardHeader title="Gestion des Retours" />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        <div className="flex items-center justify-between">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="all">Tous ({returns.length})</TabsTrigger>
              <TabsTrigger value="client">Clients ({returns.filter(r => r.return_type === 'client').length})</TabsTrigger>
              <TabsTrigger value="supplier">Fournisseurs ({returns.filter(r => r.return_type === 'supplier').length})</TabsTrigger>
            </TabsList>
          </Tabs>
          <Link href="/dashboard/returns/new">
            <Button size="sm"><RotateCcw className="h-4 w-4 mr-2" /> Nouveau retour</Button>
          </Link>
        </div>

        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <EmptyState
                icon={RotateCcw}
                className="m-4"
                title="Aucun retour enregistré"
                description="Enregistrez les produits ou emballages rendus par un client ou renvoyés à un fournisseur."
                action={{ label: 'Nouveau retour', href: '/dashboard/returns/new' }}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Client / Fournisseur</TableHead>
                    <TableHead>Commande</TableHead>
                    <TableHead className="text-center">Articles</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const st = statusBadge[r.status] || statusBadge.pending
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium text-sm">{r.return_number}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={r.return_type === 'client' ? 'border-blue-200 text-blue-700' : 'border-purple-200 text-purple-700'}>
                            {r.return_type === 'client' ? 'Client' : 'Fournisseur'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{r.client_name || r.supplier_name || '-'}</TableCell>
                        <TableCell className="text-sm text-zinc-500">{r.order_number || '-'}</TableCell>
                        <TableCell className="text-center text-sm">{formatNumber(r.items_count)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{fmt(Number(r.total_amount))}</TableCell>
                        <TableCell><Badge variant="outline" className={st.cls}>{st.label}</Badge></TableCell>
                        <TableCell className="text-sm text-zinc-500">{formatDateShort(r.created_at)}</TableCell>
                        <TableCell>
                          {r.status === 'pending' && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-9 text-xs text-emerald-600" onClick={() => setConfirm({ record: r, action: 'approve' })} disabled={processing !== null}>
                                {processing === r.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />} Traiter
                              </Button>
                              <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-red-600" onClick={() => setConfirm({ record: r, action: 'reject' })} disabled={processing !== null} aria-label={`Rejeter le retour ${r.return_number}`}>
                                <XCircle className="h-4 w-4" />
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
                {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {confirm?.action === 'approve' ? 'Oui, traiter' : 'Oui, rejeter'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  )
}
