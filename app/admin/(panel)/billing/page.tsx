'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button, buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageShell, PageIntro, StatCard, StatusBadge } from '@/components/app/blocks'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  Loader2,
  Search,
  TrendingUp,
  Calendar,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Plus,
  Receipt,
  UserCheck,
  UserMinus,
} from 'lucide-react'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { useAdmin } from '@/components/admin/admin-role'
import { ManualPaymentDialog } from '@/components/admin/billing/manual-payment-dialog'
import { PendingCheckouts, usePendingCount } from '@/components/admin/billing/pending-checkouts'
import { RemindersPanel } from '@/components/admin/billing/reminders-panel'

const fetcher = (url: string) => apiFetch(url)

type Payment = {
  id: string
  reference: string | null
  plan_name: string | null
  amount: number
  currency: string
  months: number
  status: string
  provider: string
  created_at: string
  company_id: string | null
  company_name: string | null
  receipt_number: string | null
  recorded_by: string | null
  refunded_at: string | null
  refund_reason: string | null
  method_label: string | null
}

type Metrics = {
  mrr: number
  arr: number
  revenueThisMonth: number
  revenueLastMonth: number
  payingCompanies: number
  arpa: number
  conversion90d: { created: number; converted: number; rate: number | null }
  churn30d: { churned: number; base: number; rate: number | null }
}

const statusFilters = [
  { value: '', label: 'Tous' },
  { value: 'completed', label: 'Complétés' },
  { value: 'failed', label: 'Échoués' },
  { value: 'refunded', label: 'Remboursés' },
]

const PROVIDER_LABEL: Record<string, string> = { geniuspay: 'GeniusPay', manual: 'Manuel', admin: 'Admin' }

const pct = (r: number | null) => (r == null ? '—' : `${(r * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`)

export default function AdminBillingPage() {
  const { can } = useAdmin()
  const canWrite = can('billing.write')
  const [tab, setTab] = useState('payments')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [manualOpen, setManualOpen] = useState(false)

  const [toRefund, setToRefund] = useState<Payment | null>(null)
  const [refundReason, setRefundReason] = useState('')
  const [revokeAccess, setRevokeAccess] = useState(true)
  const [refunding, setRefunding] = useState(false)

  const qs = new URLSearchParams({ search, status, page: String(page) }).toString()
  const { data, error, isLoading, mutate } = useSWR<{
    data: Payment[]
    pagination: { page: number; pages: number; total: number }
  }>(`/api/admin/billing?${qs}`, fetcher)
  const metricsQuery = useSWR<{ data: Metrics }>('/api/admin/billing/metrics', fetcher)
  const metrics = metricsQuery.data?.data
  const pendingCount = usePendingCount()

  const payments = data?.data || []
  const pagination = data?.pagination

  function refreshAll() {
    mutate()
    metricsQuery.mutate()
  }

  function openRefund(p: Payment) {
    setRefundReason('')
    setRevokeAccess(true)
    setToRefund(p)
  }

  async function refund() {
    if (!toRefund || refunding) return
    if (refundReason.trim().length < 3) {
      toast.error('Indiquez le motif du remboursement')
      return
    }
    setRefunding(true)
    try {
      const res = await apiFetch<{ data: { subscriptionEndsAt: string | null; subscriptionStatus: string | null; accessRevoked: boolean } }>(
        `/api/admin/billing/${toRefund.id}/refund`,
        { method: 'POST', body: { reason: refundReason.trim(), revokeAccess } }
      )
      const d = res.data
      toast.success('Paiement remboursé', {
        description: d.accessRevoked
          ? d.subscriptionStatus === 'canceled'
            ? 'Abonnement annulé : la période payée est retirée.'
            : `Nouvelle fin d’abonnement : ${formatDate(d.subscriptionEndsAt)}`
          : 'Abonnement inchangé.',
      })
      setToRefund(null)
      refreshAll()
    } catch (e) {
      toastError(e, 'Remboursement impossible')
    } finally {
      setRefunding(false)
    }
  }

  const monthDelta =
    metrics && metrics.revenueLastMonth > 0
      ? (metrics.revenueThisMonth - metrics.revenueLastMonth) / metrics.revenueLastMonth
      : null

  return (
    <PageShell>
      <PageIntro
        title="Facturation"
        description="Revenu récurrent, paiements d’abonnement, paiements en attente et relances"
        actions={
          canWrite ? (
            <Button variant="brand" onClick={() => setManualOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Enregistrer un paiement
            </Button>
          ) : undefined
        }
      />

      {metricsQuery.error ? (
        <ErrorState
          title="Indicateurs indisponibles"
          description={errorMessage(metricsQuery.error)}
          onRetry={() => metricsQuery.mutate()}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy={metricsQuery.isLoading}>
          <StatCard
            icon={TrendingUp}
            label="Revenu mensuel récurrent (MRR)"
            value={metrics ? formatMoney(metrics.mrr) : '—'}
            hint={
              metrics
                ? `ARR ${formatMoney(metrics.arr)} · ${formatNumber(metrics.payingCompanies)} payante(s) · ARPA ${formatMoney(metrics.arpa)}`
                : 'Dernier paiement de chaque client actif, ramené au mois'
            }
            emphasis
          />
          <StatCard
            icon={Calendar}
            label="Encaissé ce mois-ci"
            value={metrics ? formatMoney(metrics.revenueThisMonth) : '—'}
            hint={
              metrics
                ? `Mois précédent : ${formatMoney(metrics.revenueLastMonth)}${
                    monthDelta != null ? ` (${monthDelta >= 0 ? '+' : '−'}${pct(Math.abs(monthDelta))})` : ''
                  }`
                : undefined
            }
            tone="brand"
          />
          <StatCard
            icon={UserCheck}
            label="Conversion essai → payant (90 j)"
            value={metrics ? pct(metrics.conversion90d.rate) : '—'}
            hint={
              metrics
                ? `${formatNumber(metrics.conversion90d.converted)} payante(s) sur ${formatNumber(metrics.conversion90d.created)} inscrite(s)`
                : undefined
            }
            tone="success"
          />
          <StatCard
            icon={UserMinus}
            label="Churn (30 j)"
            value={metrics ? pct(metrics.churn30d.rate) : '—'}
            hint={metrics ? `${formatNumber(metrics.churn30d.churned)} abonnement(s) échu(s) non renouvelé(s)` : undefined}
            tone={metrics && metrics.churn30d.churned > 0 ? 'danger' : 'default'}
          />
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList>
          <TabsTrigger value="payments">Paiements</TabsTrigger>
          <TabsTrigger value="pending">
            Paiements en attente
            {pendingCount > 0 && (
              <span className="tabular ml-1.5 rounded-full bg-warning-soft px-1.5 text-xs font-semibold text-warning-foreground">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="reminders">Relances</TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Rechercher (entreprise, référence, plan)…"
                className="h-10 pl-9"
                aria-label="Rechercher"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par statut">
              {statusFilters.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={status === f.value}
                  onClick={() => {
                    setStatus(f.value)
                    setPage(1)
                  }}
                  className={`h-10 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    status === f.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <Card className="gap-0 overflow-hidden py-0">
            {isLoading ? (
              <div className="p-5">
                <TableSkeleton columns={6} />
              </div>
            ) : error ? (
              <ErrorState className="m-5" description={errorMessage(error)} onRetry={() => mutate()} />
            ) : payments.length === 0 ? (
              <EmptyState
                className="m-5"
                icon={CreditCard}
                title="Aucun paiement"
                description={search || status ? 'Aucun paiement ne correspond à ces filtres.' : undefined}
                action={canWrite && !search && !status ? { label: 'Enregistrer un paiement', onClick: () => setManualOpen(true) } : undefined}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Entreprise</th>
                      <th className="px-5 py-3 font-medium">Plan</th>
                      <th className="px-5 py-3 text-right font-medium">Montant</th>
                      <th className="px-5 py-3 font-medium">Statut</th>
                      <th className="px-5 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const hasReceipt = ['completed', 'manual', 'refunded'].includes(p.status)
                      return (
                        <tr key={p.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                          <td className="tabular whitespace-nowrap px-5 py-3 text-muted-foreground">{formatDate(p.created_at)}</td>
                          <td className="px-5 py-3">
                            {p.company_id ? (
                              <Link href={`/admin/companies/${p.company_id}`} className="text-foreground hover:underline">
                                {p.company_name || '—'}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">{p.company_name || 'Supprimée'}</span>
                            )}
                            {p.receipt_number && (
                              <div className="font-mono text-[11px] text-muted-foreground">{p.receipt_number}</div>
                            )}
                          </td>
                          <td className="px-5 py-3 text-foreground">
                            {p.plan_name || '—'}
                            <span className="text-xs text-muted-foreground">
                              {' '}
                              · {p.method_label || PROVIDER_LABEL[p.provider] || p.provider}
                              {p.months ? ` · ${p.months} mois` : ''}
                            </span>
                          </td>
                          <td className="tabular whitespace-nowrap px-5 py-3 text-right font-medium text-foreground">
                            {formatMoney(p.amount)}
                          </td>
                          <td className="px-5 py-3">
                            <PaymentStatusBadge status={p.status} />
                            {p.status === 'refunded' && p.refund_reason && (
                              <p className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground" title={p.refund_reason}>
                                {p.refund_reason}
                              </p>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              {hasReceipt && (
                                <Button size="sm" variant="ghost" asChild>
                                  <a
                                    href={`/api/admin/billing/${p.id}/receipt`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Reçu du paiement de ${p.company_name ?? 'l’entreprise'} (nouvel onglet)`}
                                  >
                                    <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
                                    Reçu
                                  </a>
                                </Button>
                              )}
                              {canWrite && p.status === 'completed' && Number(p.amount) > 0 && (
                                <Button size="sm" variant="outline" onClick={() => openRefund(p)}>
                                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                  Rembourser
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} / {pagination.pages}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Page précédente"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  disabled={page >= pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Page suivante"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="pending">
          <PendingCheckouts canWrite={canWrite} onChange={refreshAll} />
        </TabsContent>

        <TabsContent value="reminders">
          <RemindersPanel />
        </TabsContent>
      </Tabs>

      {canWrite && <ManualPaymentDialog open={manualOpen} onOpenChange={setManualOpen} onRecorded={refreshAll} />}

      <AlertDialog open={!!toRefund} onOpenChange={(o) => !o && !refunding && setToRefund(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rembourser ce paiement ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le paiement de {toRefund ? formatMoney(toRefund.amount) : ''}
              {toRefund?.company_name ? ` (${toRefund.company_name})` : ''} passera au statut « Remboursé » et sortira du
              revenu. Cette action est définitive. Le reversement des fonds se fait chez le prestataire de paiement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="refund-reason">Motif (obligatoire)</Label>
              <Textarea
                id="refund-reason"
                rows={3}
                maxLength={500}
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Ex. : double paiement, résiliation à la demande du client…"
                aria-required="true"
              />
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border p-3">
              <Checkbox
                id="refund-revoke"
                checked={revokeAccess}
                onCheckedChange={(v) => setRevokeAccess(v === true)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label htmlFor="refund-revoke">Retirer la période payée</Label>
                <p className="text-xs text-muted-foreground">
                  La fin d’abonnement recule de {toRefund?.months ?? 0} mois (jamais avant aujourd’hui). Si elle est
                  dépassée, l’abonnement est annulé.
                </p>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={refunding}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={refunding || refundReason.trim().length < 3}
              onClick={(e) => {
                e.preventDefault()
                refund()
              }}
            >
              {refunding && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Rembourser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}

function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: 'success' | 'danger' | 'default' | 'brand' }> = {
    completed: { label: 'Complété', tone: 'success' },
    failed: { label: 'Échoué', tone: 'danger' },
    refunded: { label: 'Remboursé', tone: 'default' },
    manual: { label: 'Manuel', tone: 'brand' },
  }
  const s = map[status] || { label: status, tone: 'default' as const }
  return <StatusBadge label={s.label} tone={s.tone} />
}
