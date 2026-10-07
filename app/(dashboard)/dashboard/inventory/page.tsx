'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { ClipboardList, Loader2, Plus, Eye, Download } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { apiFetch, toastError } from '@/lib/api-client'
import { formatDateShort, formatNumber, formatSignedMoney } from '@/lib/format'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'

interface InventorySession {
  id: string; session_number: string; inventory_type: string; depot_name: string
  status: string; total_items: number; items_with_variance: number
  total_variance_value: number; started_by_name: string; started_at: string
  completed_at: string | null
}

interface Depot { id: string; name: string }

const statusBadge: Record<string, { label: string; cls: string }> = {
  in_progress: { label: 'En cours', cls: 'bg-brand-soft text-brand-strong border-brand/40' },
  completed: { label: 'Terminé', cls: 'bg-success-soft text-success border-success/30' },
  cancelled: { label: 'Annulé', cls: 'bg-muted text-muted-foreground border-border' },
}

export default function InventoryPage() {
  const [sessions, setSessions] = useState<InventorySession[]>([])
  const [depots, setDepots] = useState<Depot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [newDepotId, setNewDepotId] = useState('')
  const [newType, setNewType] = useState('full')
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

  async function handleCreate() {
    if (!newDepotId || submitting) return
    setSubmitting(true)
    try {
      const json = await apiFetch<{ data: { id: string } }>('/api/inventory', {
        method: 'POST',
        body: { depot_id: newDepotId, inventory_type: newType },
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

  if (isLoading) {
    return <PageSkeleton />
  }

  return (
    <div className="flex flex-col min-h-screen bg-muted/30">
      <DashboardHeader title="Inventaire" />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">{formatNumber(sessions.length)} inventaire(s)</div>
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Nouvel inventaire</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Démarrer un inventaire</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Dépôt</Label>
                  <Select value={newDepotId} onValueChange={setNewDepotId}>
                    <SelectTrigger className="mt-1" aria-label="Dépôt"><SelectValue placeholder={depots.length ? 'Choisir un dépôt' : 'Aucun dépôt disponible'} /></SelectTrigger>
                    <SelectContent>
                      {depots.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger className="mt-1" aria-label="Type d'inventaire"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Complet</SelectItem>
                      <SelectItem value="partial">Partiel</SelectItem>
                      <SelectItem value="spot_check">Contrôle ponctuel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline" disabled={submitting}>Annuler</Button></DialogClose>
                <Button onClick={handleCreate} disabled={submitting || !newDepotId}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ClipboardList className="h-4 w-4 mr-2" />} Démarrer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {loadError ? (
              <ErrorState className="m-4" description="La liste des inventaires n'a pas pu être chargée." onRetry={fetchData} />
            ) : sessions.length === 0 ? (
              <EmptyState
                className="m-4"
                icon={ClipboardList}
                title="Aucun inventaire"
                description="Démarrez un inventaire pour comparer le stock réel au stock enregistré."
                action={{ label: 'Nouvel inventaire', onClick: () => setOpenNew(true) }}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Dépôt</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">Articles</TableHead>
                    <TableHead className="text-center">Écarts</TableHead>
                    <TableHead className="text-right">Valeur écarts</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => {
                    const st = statusBadge[s.status] || statusBadge.in_progress
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium text-sm">{s.session_number}</TableCell>
                        <TableCell className="text-sm">{s.depot_name}</TableCell>
                        <TableCell className="text-sm capitalize">{s.inventory_type === 'full' ? 'Complet' : s.inventory_type === 'partial' ? 'Partiel' : 'Contrôle'}</TableCell>
                        <TableCell className="text-center text-sm">{formatNumber(s.total_items)}</TableCell>
                        <TableCell className="text-center text-sm">{s.items_with_variance > 0 ? <span className="text-destructive font-medium">{formatNumber(s.items_with_variance)}</span> : '0'}</TableCell>
                        <TableCell className={`text-right text-sm ${Number(s.total_variance_value) < 0 ? 'text-destructive' : ''}`}>{s.status === 'completed' ? formatSignedMoney(s.total_variance_value) : '-'}</TableCell>
                        <TableCell><Badge variant="outline" className={st.cls}>{st.label}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDateShort(s.started_at)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Link href={`/dashboard/inventory/${s.id}`}>
                              <Button size="sm" variant="outline" className="h-7 text-xs"><Eye className="h-3 w-3 mr-1" /> {s.status === 'in_progress' ? 'Compter' : 'Voir'}</Button>
                            </Link>
                            {s.status === 'completed' && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" aria-label={`Télécharger le PDF de ${s.session_number}`} onClick={() => window.open(`/api/export/pdf?type=inventory&id=${s.id}`, '_blank')}>
                                <Download className="h-3 w-3" aria-hidden="true" />
                              </Button>
                            )}
                          </div>
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
