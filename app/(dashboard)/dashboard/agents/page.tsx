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
  Users, Loader2, Plus, Eye, Edit, DollarSign, TrendingUp, UserCheck,
} from 'lucide-react'
import Link from 'next/link'

interface SalesAgent {
  id: string; full_name: string; phone: string | null; email: string | null
  zone: string | null; commission_rate: number; is_active: boolean
  client_count: number; monthly_sales: number; pending_commissions: number
}

function fmt(n: number) { return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(n) + ' FCFA' }

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

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/agents')
      const json = await res.json()
      setAgents(json.data || [])
    } catch (e) { console.error(e) }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleCreate() {
    if (!newName) return
    setSubmitting(true)
    try {
      await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: newName,
          phone: newPhone || undefined,
          email: newEmail || undefined,
          zone: newZone || undefined,
          commission_rate: Number(newCommission) || 0,
        }),
      })
      setOpenNew(false)
      setNewName(''); setNewPhone(''); setNewEmail(''); setNewZone(''); setNewCommission('')
      fetchData()
    } finally { setSubmitting(false) }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Commerciaux" />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      <DashboardHeader title="Commerciaux" />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="text-xs text-zinc-500 mb-1">Total commerciaux</div>
            <div className="text-xl font-bold text-zinc-950">{agents.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-zinc-500 mb-1">Actifs</div>
            <div className="text-xl font-bold text-emerald-600">{agents.filter(a => a.is_active).length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-zinc-500 mb-1">Ventes du mois</div>
            <div className="text-xl font-bold text-blue-600">{fmt(agents.reduce((s, a) => s + Number(a.monthly_sales), 0))}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-zinc-500 mb-1">Commissions en attente</div>
            <div className="text-xl font-bold text-amber-600">{fmt(agents.reduce((s, a) => s + Number(a.pending_commissions), 0))}</div>
          </Card>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-zinc-500">{agents.length} commercial(aux)</div>
          <Dialog open={openNew} onOpenChange={setOpenNew}>
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
                    <Input type="number" step="0.1" value={newCommission} onChange={(e) => setNewCommission(e.target.value)} className="mt-1" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
                <Button onClick={handleCreate} disabled={submitting || !newName} className="bg-emerald-600 hover:bg-emerald-700">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Users className="h-4 w-4 mr-2" />} Ajouter
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {agents.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">Aucun commercial</div>
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
                          <div className="h-8 w-8 rounded-full bg-zinc-100 flex items-center justify-center">
                            <UserCheck className="h-4 w-4 text-zinc-600" />
                          </div>
                          <span className="font-medium text-sm">{agent.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {agent.phone && <div>{agent.phone}</div>}
                        {agent.email && <div className="text-xs text-zinc-400">{agent.email}</div>}
                      </TableCell>
                      <TableCell className="text-sm">{agent.zone || '-'}</TableCell>
                      <TableCell className="text-center text-sm">{agent.client_count}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{fmt(Number(agent.monthly_sales))}</TableCell>
                      <TableCell className="text-right text-sm text-amber-600">{fmt(Number(agent.pending_commissions))}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={agent.is_active ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 'border-zinc-200 text-zinc-500 bg-zinc-50'}>
                          {agent.is_active ? 'Actif' : 'Inactif'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Link href={`/dashboard/agents/${agent.id}`}>
                            <Button size="sm" variant="outline" className="h-7 text-xs">
                              <Eye className="h-3 w-3 mr-1" /> Détails
                            </Button>
                          </Link>
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
