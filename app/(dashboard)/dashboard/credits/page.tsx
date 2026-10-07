'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, StatCard, StatusBadge } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  CreditCard, AlertTriangle, Loader2, Banknote, Phone, Search, Wallet, Percent,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, toastError, toastWarnings } from '@/lib/api-client'
import { formatDateShort, formatMoney, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { MobileMoneyButton, useMobileMoneyAvailability } from '@/components/payments/mobile-money-button'

interface Credit {
  id: string; credit_number: string; client_name: string; client_phone: string
  total_amount: number; paid_amount: number; due_date: string | null
  status: string; is_overdue: boolean; days_overdue: number
  order_number: string | null; created_at: string; account_type: string | null
}
interface Stats {
  total_credits: number; total_outstanding: number; overdue_count: number; overdue_amount: number
}

const fmt = formatMoney

type Tone = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

const statusLabels: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'En attente', tone: 'warning' },
  partial: { label: 'Partiel', tone: 'brand' },
  paid: { label: 'Payé', tone: 'success' },
  overdue: { label: 'En retard', tone: 'danger' },
  written_off: { label: 'Abandonné', tone: 'default' },
}

export default function CreditsPage() {
  const [credits, setCredits] = useState<Credit[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [payDialog, setPayDialog] = useState<Credit | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payNotes, setPayNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [remindingId, setRemindingId] = useState<string | null>(null)
  const mobileMoney = useMobileMoneyAvailability()

  const fetchData = useCallback(async () => {
    setLoadError(false)
    try {
      const json = await apiFetch('/api/credits')
      setCredits(json.data?.credits || [])
      setStats(json.data?.stats || null)
    } catch (e) {
      // Premier chargement : écran d'erreur ; rafraîchissement : simple toast
      setLoadError(true)
      toastError(e, 'Impossible de charger les créances')
    }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handlePay() {
    if (!payDialog || !payAmount || submitting) return
    setSubmitting(true)
    try {
      const res = await apiFetch(`/api/credits/${payDialog.id}/pay`, {
        method: 'POST',
        body: { amount: Number(payAmount), payment_method: payMethod, notes: payNotes || undefined },
      })
      toast.success(`Paiement de ${fmt(Number(payAmount))} enregistré`)
      toastWarnings(res.warnings)
      setPayDialog(null); setPayAmount(''); setPayNotes('')
      fetchData()
    } catch (e) {
      toastError(e, 'Paiement non enregistré')
    } finally { setSubmitting(false) }
  }

  // Enregistre une relance dans l'historique (aucun SMS n'est envoyé)
  async function handleRemind(credit: Credit, type: string) {
    if (remindingId) return
    setRemindingId(credit.id)
    try {
      await apiFetch(`/api/credits/${credit.id}/remind`, {
        method: 'POST',
        body: { reminder_type: type, message: `Relance pour créance ${credit.credit_number}` },
      })
      toast.success('Relance enregistrée', { description: `${credit.client_name} — ${credit.credit_number}` })
      fetchData()
    } catch (e) {
      toastError(e, 'Relance non enregistrée')
    } finally {
      setRemindingId(null)
    }
  }

  const filtered = credits.filter(c =>
    c.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.credit_number?.toLowerCase().includes(search.toLowerCase())
  )

  if (isLoading) {
    return <PageSkeleton />
  }

  if (loadError && credits.length === 0 && !stats) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title="Crédits clients" description="Créances à recouvrer et relances" />
        <PageShell>
          <ErrorState title="Impossible de charger les créances" onRetry={() => { setIsLoading(true); fetchData() }} />
        </PageShell>
      </div>
    )
  }

  const recoveryRate = credits.length > 0 ? Math.round((credits.filter(c => c.status === 'paid').length / credits.length) * 100) : 0
  const isOpen = (c: Credit) => c.status !== 'paid' && c.status !== 'written_off'
  const openPay = (c: Credit, remaining: number) => { setPayDialog(c); setPayAmount(String(remaining)) }
  const mmTarget = (c: Credit, remaining: number) => ({
    kind: 'credit' as const,
    creditNoteId: c.id,
    label: `Créance ${c.credit_number}`,
    remaining,
  })

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Crédits clients" description="Créances à recouvrer et relances" />
      <PageShell>
        {/* Indicateurs */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Montant en cours"
            value={fmt(Number(stats?.total_outstanding || 0))}
            hint="Reste à encaisser"
            icon={Wallet}
            emphasis
          />
          <StatCard
            label="Créances"
            value={formatNumber(stats?.total_credits || 0)}
            hint="Toutes créances confondues"
            icon={CreditCard}
          />
          <StatCard
            label="En retard"
            value={formatNumber(stats?.overdue_count || 0)}
            hint={fmt(Number(stats?.overdue_amount || 0))}
            icon={AlertTriangle}
            tone="danger"
          />
          <StatCard
            label="Taux de recouvrement"
            value={`${recoveryRate} %`}
            hint="Créances entièrement payées"
            icon={Percent}
            tone="success"
          />
        </div>

        <div className="space-y-4">
          {/* Barre d'outils */}
          <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Rechercher une créance"
              placeholder="Client ou n° de créance…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 pl-9"
            />
          </div>
            {mobileMoney?.enabled && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/mobile-money">Suivi Mobile Money</Link>
              </Button>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={search ? Search : CreditCard}
              title={search ? 'Aucune créance ne correspond à la recherche' : 'Aucune créance'}
              description={search ? undefined : 'Les ventes à crédit apparaîtront ici.'}
              action={search ? { label: 'Effacer la recherche', onClick: () => setSearch('') } : undefined}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
              {/* Tableau (≥ md) */}
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Créance</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead className="text-right">Payé</TableHead>
                      <TableHead className="text-right">Reste</TableHead>
                      <TableHead>Échéance</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="pr-5">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => {
                      const remaining = Number(c.total_amount) - Number(c.paid_amount)
                      const st = c.is_overdue ? statusLabels.overdue : statusLabels[c.status] || statusLabels.pending
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="pl-5">
                            <div className="font-mono text-sm font-medium text-foreground">{c.credit_number}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {c.account_type === 'packaging' ? 'Emballages' : 'Produits'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium text-foreground">{c.client_name}</div>
                            {c.client_phone && <div className="tabular text-xs text-muted-foreground">{c.client_phone}</div>}
                          </TableCell>
                          <TableCell className="tabular text-right text-sm">{fmt(Number(c.total_amount))}</TableCell>
                          <TableCell className="tabular text-right text-sm text-muted-foreground">{fmt(Number(c.paid_amount))}</TableCell>
                          <TableCell className="tabular text-right text-sm font-semibold text-foreground">
                            {remaining > 0 ? fmt(remaining) : <span className="font-normal text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="tabular text-sm">
                            {c.due_date ? (
                              <span className={c.is_overdue ? 'font-medium text-destructive' : 'text-foreground'}>
                                {formatDateShort(c.due_date)}
                                {c.is_overdue && <span className="text-xs"> · {c.days_overdue} j de retard</span>}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell><StatusBadge label={st.label} tone={st.tone} /></TableCell>
                          <TableCell className="pr-5">
                            {isOpen(c) && (
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="outline" onClick={() => openPay(c, remaining)}>
                                  <Banknote className="h-4 w-4" aria-hidden="true" />
                                  Encaisser
                                </Button>
                                <MobileMoneyButton
                                  size="sm"
                                  label="Mobile Money"
                                  target={mmTarget(c, remaining)}
                                  clientName={c.client_name}
                                  clientPhone={c.client_phone}
                                  onPaid={fetchData}
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => handleRemind(c, 'call')}
                                  disabled={remindingId !== null}
                                  aria-label={`Enregistrer une relance (appel) pour ${c.client_name}`}
                                  title="Enregistrer une relance (appel)"
                                >
                                  {remindingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Phone className="h-4 w-4" aria-hidden="true" />}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Cartes (< md) */}
              <ul className="divide-y divide-border md:hidden">
                {filtered.map((c) => {
                  const remaining = Number(c.total_amount) - Number(c.paid_amount)
                  const st = c.is_overdue ? statusLabels.overdue : statusLabels[c.status] || statusLabels.pending
                  return (
                    <li key={c.id} className="space-y-3 px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-foreground">{c.client_name}</p>
                            <StatusBadge label={st.label} tone={st.tone} />
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            <span className="font-mono">{c.credit_number}</span>
                            {' · '}
                            {c.account_type === 'packaging' ? 'Emballages' : 'Produits'}
                            {c.due_date && (
                              <span className={cn(c.is_overdue && 'text-destructive')}>
                                {' · '}Échéance {formatDateShort(c.due_date)}
                                {c.is_overdue && ` (${c.days_overdue} j)`}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="tabular text-sm font-semibold text-foreground">{remaining > 0 ? fmt(remaining) : '—'}</p>
                          <p className="tabular text-xs text-muted-foreground">sur {fmt(Number(c.total_amount))}</p>
                        </div>
                      </div>
                      {isOpen(c) && (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => openPay(c, remaining)}>
                            <Banknote className="h-4 w-4" aria-hidden="true" />
                            Encaisser
                          </Button>
                          <MobileMoneyButton
                            size="sm"
                            label="Mobile Money"
                            className="flex-1"
                            target={mmTarget(c, remaining)}
                            clientName={c.client_name}
                            clientPhone={c.client_phone}
                            onPaid={fetchData}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemind(c, 'call')}
                            disabled={remindingId !== null}
                            aria-label={`Enregistrer une relance (appel) pour ${c.client_name}`}
                          >
                            {remindingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Phone className="h-4 w-4" aria-hidden="true" />}
                            Relance
                          </Button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Encaissement */}
        <Dialog open={!!payDialog} onOpenChange={(o) => { if (!o && !submitting) setPayDialog(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Encaisser la créance</DialogTitle>
              <DialogDescription>
                <span className="font-mono">{payDialog?.credit_number}</span> — {payDialog?.client_name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <dl className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="tabular text-foreground">{fmt(Number(payDialog?.total_amount || 0))}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Déjà payé</dt>
                  <dd className="tabular text-success">{fmt(Number(payDialog?.paid_amount || 0))}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                  <dt className="text-foreground">Reste à payer</dt>
                  <dd className="tabular text-destructive">{fmt(Number(payDialog?.total_amount || 0) - Number(payDialog?.paid_amount || 0))}</dd>
                </div>
              </dl>
              <div className="space-y-2">
                <Label htmlFor="pay-amount">Montant à encaisser (FCFA)</Label>
                <Input
                  id="pay-amount"
                  type="number"
                  min={1}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="tabular h-11 text-lg font-semibold"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-method">Mode de paiement</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger id="pay-method" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Espèces</SelectItem>
                    <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    <SelectItem value="bank_transfer">Virement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-notes">Notes (facultatif)</Label>
                <Textarea id="pay-notes" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Référence, détails…" />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline" disabled={submitting}>Annuler</Button></DialogClose>
              <Button variant="brand" onClick={handlePay} disabled={submitting || !payAmount || Number(payAmount) <= 0}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Banknote className="h-4 w-4" aria-hidden="true" />}
                Encaisser
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageShell>
    </div>
  )
}
