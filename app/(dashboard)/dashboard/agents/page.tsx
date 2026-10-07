'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Users, Loader2, Plus, Eye, UserCheck,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch, toastError } from '@/lib/api-client'
import { formatMoney, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'

interface SalesAgent {
  id: string; full_name: string; phone: string | null; email: string | null
  zone: string | null; commission_rate: number; is_active: boolean
  client_count: number; monthly_sales: number; pending_commissions: number
}

const fmt = formatMoney

export default function AgentsPage() {
  const [agents, setAgents] = useState<SalesAgent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [openNew, setOpenNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newZone, setNewZone] = useState('')
  const [newCommission, setNewCommission] = useState('')

  const [loadError, setLoadError] = useState(false)

  const fetchData = useCallback(async () => {
    setLoadError(false)
    try {
      const json = await apiFetch('/api/agents')
      setAgents(json.data || [])
    } catch (e) {
      setLoadError(true)
      toastError(e, 'Impossible de charger les commerciaux')
    }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleCreate() {
    if (!newName.trim() || submitting) return
    setSubmitting(true)
    try {
      await apiFetch('/api/agents', {
        method: 'POST',
        body: {
          full_name: newName.trim(),
          phone: newPhone || undefined,
          email: newEmail || undefined,
          zone: newZone || undefined,
          commission_rate: Number(newCommission) || 0,
        },
      })
      toast.success('Commercial ajouté')
      setOpenNew(false)
      setNewName(''); setNewPhone(''); setNewEmail(''); setNewZone(''); setNewCommission('')
      fetchData()
    } catch (e) {
      toastError(e, 'Commercial non ajouté')
    } finally { setSubmitting(false) }
  }

  if (isLoading) {
    return <PageSkeleton />
  }

  if (loadError && agents.length === 0) {
    return (
      <div className="flex flex-col min-h-screen bg-muted/30">
        <DashboardHeader title="Commerciaux" />
        <main className="flex-1 p-4 lg:p-6">
          <ErrorState title="Impossible de charger les commerciaux" onRetry={() => { setIsLoading(true); fetchData() }} />
        </main>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-muted/30">
      <DashboardHeader title="Commerciaux" />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Total commerciaux</div>
            <div className="text-xl font-bold text-foreground">{formatNumber(agents.length)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Actifs</div>
            <div className="text-xl font-bold text-success">{formatNumber(agents.filter(a => a.is_active).length)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Ventes du mois</div>
            <div className="text-xl font-bold text-brand-strong">{fmt(agents.reduce((s, a) => s + Number(a.monthly_sales), 0))}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Commissions en attente</div>
            <div className="text-xl font-bold text-warning-foreground">{fmt(agents.reduce((s, a) => s + Number(a.pending_commissions), 0))}</div>
          </Card>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">{agents.length} commercial(aux)</div>
          <Dialog open={openNew} onOpenChange={(o) => { if (!submitting) setOpenNew(o) }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Nouveau commercial</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Ajouter un commercial</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Nom complet *</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Téléphone</Label>
                    <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Zone</Label>
                    <Input value={newZone} onChange={(e) => setNewZone(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label>Taux commission (%)</Label>
                    <Input type="number" step="0.1" min={0} max={100} value={newCommission} onChange={(e) => setNewCommission(e.target.value)} className="mt-1" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
                <Button onClick={handleCreate} disabled={submitting || !newName.trim()} className="bg-success hover:bg-success">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Users className="h-4 w-4 mr-2" />} Ajouter
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {agents.length === 0 ? (
              <EmptyState
                icon={Users}
                className="m-4"
                title="Aucun commercial"
                description="Ajoutez vos commerciaux pour suivre leurs ventes et commissions."
                action={{ label: 'Nouveau commercial', onClick: () => setOpenNew(true) }}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Commercial</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Zone</TableHead>
                    <TableHead className="text-center">Clients</TableHead>
                    <TableHead className="text-right">Ventes mois</TableHead>
                    <TableHead className="text-right">Commissions</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            <UserCheck className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <span className="font-medium text-sm">{agent.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {agent.phone && <div>{agent.phone}</div>}
                        {agent.email && <div className="text-xs text-muted-foreground/70">{agent.email}</div>}
                      </TableCell>
                      <TableCell className="text-sm">{agent.zone || '-'}</TableCell>
                      <TableCell className="text-center text-sm">{formatNumber(agent.client_count)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{fmt(Number(agent.monthly_sales))}</TableCell>
                      <TableCell className="text-right text-sm text-warning-foreground">{fmt(Number(agent.pending_commissions))}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={agent.is_active ? 'border-success/30 text-success bg-success-soft' : 'border-border text-muted-foreground bg-muted/50'}>
                          {agent.is_active ? 'Actif' : 'Inactif'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-9 text-xs" asChild>
                            <Link href={`/dashboard/agents/${agent.id}`}>
                              <Eye className="h-3.5 w-3.5 mr-1" /> Détails
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
