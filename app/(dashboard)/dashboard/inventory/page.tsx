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

interface InventorySession {
  id: string; session_number: string; inventory_type: string; depot_name: string
  status: string; total_items: number; items_with_variance: number
  total_variance_value: number; started_by_name: string; started_at: string
  completed_at: string | null
}

interface Depot { id: string; name: string }

function fmt(n: number) { return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(n) + ' FCFA' }

const statusBadge: Record<string, { label: string; cls: string }> = {
  in_progress: { label: 'En cours', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed: { label: 'Terminé', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Annulé', cls: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
}

export default function InventoryPage() {
  const [sessions, setSessions] = useState<InventorySession[]>([])
  const [depots, setDepots] = useState<Depot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [newDepotId, setNewDepotId] = useState('')
  const [newType, setNewType] = useState('full')
  const [submitting, setSubmitting] = useState(false)
  const [openNew, setOpenNew] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [invRes, depotRes] = await Promise.all([
        fetch('/api/inventory'),
        fetch('/api/depots'),
      ])
      if (!invRes.ok || !depotRes.ok) {
        throw new Error('Failed to fetch data')
      }
      const invJson = await invRes.json()
      const depotJson = await depotRes.json()
      setSessions(invJson.data || [])
      setDepots(Array.isArray(depotJson.data) ? depotJson.data : Array.isArray(depotJson) ? depotJson : [])
    } catch (e) { 
      console.error('Error fetching inventory data:', e)
      setDepots([])
    }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleCreate() {
    if (!newDepotId) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depot_id: newDepotId, inventory_type: newType }),
      })
      if (res.ok) {
        const json = await res.json()
        setOpenNew(false)
        setNewDepotId('')
        fetchData()
        // Navigate to the new inventory session
        window.location.href = `/dashboard/inventory/${json.data?.id || ''}`
      }
    } finally { setSubmitting(false) }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Inventaire" />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      <DashboardHeader title="Inventaire" />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        <div className="flex items-center justify-between">
          <div className="text-sm text-zinc-500">{sessions.length} inventaire(s)</div>
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
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir un dépôt" /></SelectTrigger>
                    <SelectContent>
                      {depots.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Complet</SelectItem>
                      <SelectItem value="partial">Partiel</SelectItem>
                      <SelectItem value="spot_check">Contrôle ponctuel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
                <Button onClick={handleCreate} disabled={submitting || !newDepotId}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ClipboardList className="h-4 w-4 mr-2" />} Démarrer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {sessions.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">Aucun inventaire</div>
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
                        <TableCell className="text-center text-sm">{s.total_items}</TableCell>
                        <TableCell className="text-center text-sm">{s.items_with_variance > 0 ? <span className="text-red-600 font-medium">{s.items_with_variance}</span> : '0'}</TableCell>
                        <TableCell className={`text-right text-sm ${Number(s.total_variance_value) < 0 ? 'text-red-600' : ''}`}>{s.status === 'completed' ? fmt(Number(s.total_variance_value)) : '-'}</TableCell>
                        <TableCell><Badge variant="outline" className={st.cls}>{st.label}</Badge></TableCell>
                        <TableCell className="text-sm text-zinc-500">{new Date(s.started_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Link href={`/dashboard/inventory/${s.id}`}>
                              <Button size="sm" variant="outline" className="h-7 text-xs"><Eye className="h-3 w-3 mr-1" /> {s.status === 'in_progress' ? 'Compter' : 'Voir'}</Button>
                            </Link>
                            {s.status === 'completed' && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => window.open(`/api/export/pdf?type=inventory&id=${s.id}`, '_blank')}>
                                <Download className="h-3 w-3" />
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
