'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ArrowLeftRight, Loader2, CheckCircle2, Plus } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch, toastError, toastWarnings } from '@/lib/api-client'
import { formatDateShort, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'

interface Transfer {
  id: string; transfer_number: string; source_depot_name: string; destination_depot_name: string
  status: string; items_count: number; created_by_name: string | null; received_by_name: string | null
  created_at: string; received_at: string | null
}

const statusBadge: Record<string, { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'bg-warning-soft text-warning-foreground border-warning/30' },
  in_transit: { label: 'En transit', cls: 'bg-brand-soft text-brand-strong border-brand/40' },
  received: { label: 'Réceptionné', cls: 'bg-success-soft text-success border-success/30' },
  partial: { label: 'Partiel', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  cancelled: { label: 'Annulé', cls: 'bg-muted text-muted-foreground border-border' },
}

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [toReceive, setToReceive] = useState<Transfer | null>(null)
  const [receiving, setReceiving] = useState(false)

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

  if (isLoading) {
    return <PageSkeleton />
  }

  return (
    <div className="flex flex-col min-h-screen bg-muted/30">
      <DashboardHeader title="Transferts inter-dépôts" />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">{formatNumber(transfers.length)} transfert(s)</div>
          <Link href="/dashboard/transfers/new">
            <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Nouveau transfert</Button>
          </Link>
        </div>

        <Card>
          <CardContent className="p-0">
            {loadError ? (
              <ErrorState className="m-4" description="La liste des transferts n'a pas pu être chargée." onRetry={fetchData} />
            ) : transfers.length === 0 ? (
              <EmptyState
                className="m-4"
                icon={ArrowLeftRight}
                title="Aucun transfert"
                description="Déplacez du stock d'un dépôt à un autre en créant un transfert."
                action={{ label: 'Nouveau transfert', href: '/dashboard/transfers/new' }}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead><span className="sr-only">Sens</span></TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead className="text-center">Articles</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Créé par</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((t) => {
                    const st = statusBadge[t.status] || statusBadge.pending
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium text-sm">{t.transfer_number}</TableCell>
                        <TableCell className="text-sm">{t.source_depot_name}</TableCell>
                        <TableCell><ArrowLeftRight className="h-4 w-4 text-muted-foreground/70" aria-hidden="true" /></TableCell>
                        <TableCell className="text-sm">{t.destination_depot_name}</TableCell>
                        <TableCell className="text-center text-sm">{formatNumber(t.items_count)}</TableCell>
                        <TableCell><Badge variant="outline" className={st.cls}>{st.label}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{t.created_by_name || '-'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDateShort(t.created_at)}</TableCell>
                        <TableCell>
                          {(t.status === 'pending' || t.status === 'in_transit') && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={receiving}
                              onClick={() => setToReceive(t)}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Réceptionner
                            </Button>
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

        <AlertDialog open={!!toReceive} onOpenChange={(o) => { if (!o && !receiving) setToReceive(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Réceptionner le transfert {toReceive?.transfer_number} ?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    Toutes les quantités envoyées seront considérées comme reçues, sans perte ni casse.
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                      Dépôt source <strong>{toReceive?.source_depot_name}</strong> : débité des quantités envoyées
                      {toReceive?.status === 'in_transit' ? ' (déjà fait pour un transfert en transit).' : '.'}
                    </li>
                    <li>
                      Dépôt destination <strong>{toReceive?.destination_depot_name}</strong> : crédité de la totalité.
                    </li>
                  </ul>
                  <p>Cette opération est irréversible.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={receiving}>Annuler</AlertDialogCancel>
              <Button onClick={handleReceive} disabled={receiving}>
                {receiving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Confirmer la réception
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  )
}
