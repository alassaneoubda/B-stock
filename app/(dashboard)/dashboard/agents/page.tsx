'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
import {
  Users, Loader2, Plus, UserCheck, Wallet,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
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

  const description = 'Équipe commerciale, ventes du mois et commissions'

  if (loadError && agents.length === 0) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title="Commerciaux" description={description} />
        <PageShell>
          <ErrorState title="Impossible de charger les commerciaux" onRetry={() => { setIsLoading(true); fetchData() }} />
        </PageShell>
      </div>
    )
  }

  const activeCount = agents.filter((a) => a.is_active).length
  const monthlyTotal = agents.reduce((s, a) => s + Number(a.monthly_sales), 0)
  const pendingTotal = agents.reduce((s, a) => s + Number(a.pending_commissions), 0)

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title="Commerciaux"
        description={description}
        actions={
          <Button variant="brand" size="sm" className="h-9" onClick={() => setOpenNew(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Nouveau commercial</span>
            <span className="sr-only sm:hidden">Nouveau commercial</span>
          </Button>
        }
      />
      <PageShell>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Commerciaux" value={formatNumber(agents.length)} icon={Users} />
          <StatCard label="Actifs" value={formatNumber(activeCount)} icon={UserCheck} tone="success" hint={`${formatNumber(agents.length - activeCount)} inactif(s)`} />
          <StatCard label="Ventes du mois" value={fmt(monthlyTotal)} emphasis />
          <StatCard label="Commissions en attente" value={fmt(pendingTotal)} icon={Wallet} tone="warning" />
        </div>

        <Panel title="Équipe" description={`${formatNumber(agents.length)} commercial(aux)`}>
          {agents.length === 0 ? (
            <EmptyState
              icon={Users}
              className="m-4"
              title="Aucun commercial"
              description="Ajoutez vos commerciaux pour suivre leurs ventes et commissions."
              action={{ label: 'Nouveau commercial', onClick: () => setOpenNew(true) }}
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">Commercial</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Zone</TableHead>
                      <TableHead className="text-right">Clients</TableHead>
                      <TableHead className="text-right">Ventes du mois</TableHead>
                      <TableHead className="text-right">Commissions</TableHead>
                      <TableHead className="pr-5">Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agents.map((agent) => (
                      <TableRow
                        key={agent.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/dashboard/agents/${agent.id}`)}
                      >
                        <TableCell className="pl-5">
                          <Link
                            href={`/dashboard/agents/${agent.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded-sm text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {agent.full_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          {agent.phone && <div className="tabular">{agent.phone}</div>}
                          {agent.email && <div className="text-xs text-muted-foreground">{agent.email}</div>}
                          {!agent.phone && !agent.email && <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm">{agent.zone || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="tabular text-right text-sm">{formatNumber(agent.client_count)}</TableCell>
                        <TableCell className="tabular text-right text-sm font-semibold">{fmt(Number(agent.monthly_sales))}</TableCell>
                        <TableCell className="tabular text-right text-sm">{fmt(Number(agent.pending_commissions))}</TableCell>
                        <TableCell className="pr-5">
                          <StatusBadge label={agent.is_active ? 'Actif' : 'Inactif'} tone={agent.is_active ? 'success' : 'default'} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul className="divide-y divide-border md:hidden">
                {agents.map((agent) => (
                  <li key={agent.id}>
                    <Link
                      href={`/dashboard/agents/${agent.id}`}
                      className="flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-medium text-foreground">{agent.full_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[agent.zone, `${formatNumber(agent.client_count)} client(s)`, agent.phone].filter(Boolean).join(' · ')}
                        </p>
                        <StatusBadge label={agent.is_active ? 'Actif' : 'Inactif'} tone={agent.is_active ? 'success' : 'default'} />
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular text-sm font-semibold text-foreground">{fmt(Number(agent.monthly_sales))}</p>
                        <p className="text-xs text-muted-foreground">ce mois</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        <Dialog open={openNew} onOpenChange={(o) => { if (!submitting) setOpenNew(o) }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nouveau commercial</DialogTitle>
              <DialogDescription>Ses ventes et commissions seront suivies automatiquement.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="agent-name">Nom complet *</Label>
                <Input id="agent-name" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-phone">Téléphone</Label>
                <Input id="agent-phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-email">E-mail</Label>
                <Input id="agent-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-zone">Zone</Label>
                <Input id="agent-zone" value={newZone} onChange={(e) => setNewZone(e.target.value)} placeholder="ex. Yopougon" className="h-10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-commission">Taux de commission (%)</Label>
                <Input id="agent-commission" type="number" step="0.1" min={0} max={100} value={newCommission} onChange={(e) => setNewCommission(e.target.value)} className="tabular h-10" />
                <p className="text-xs text-muted-foreground">Appliqué au montant de ses ventes.</p>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
              <Button onClick={handleCreate} disabled={submitting || !newName.trim()}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Ajouter
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageShell>
    </div>
  )
}
