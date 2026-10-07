'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
import { Loader2, Search, TrendingUp, Calendar, RotateCcw, ChevronLeft, ChevronRight, CreditCard, CheckCircle2, XCircle } from 'lucide-react'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'

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
}

const statusFilters = [
  { value: '', label: 'Tous' },
  { value: 'completed', label: 'Complétés' },
  { value: 'failed', label: 'Échoués' },
  { value: 'refunded', label: 'Remboursés' },
  { value: 'manual', label: 'Manuels' },
]

export default function AdminBillingPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const [toRefund, setToRefund] = useState<Payment | null>(null)

  const qs = new URLSearchParams({ search, status, page: String(page) }).toString()
  const { data, error, isLoading, mutate } = useSWR<{
    data: Payment[]
    summary: { revenueTotal: number; revenueMonth: number; completed: number; failed: number; refunded: number }
    pagination: { page: number; pages: number; total: number }
  }>(`/api/admin/billing?${qs}`, fetcher)

  const payments = data?.data || []
  const summary = data?.summary
  const pagination = data?.pagination

  async function refund(p: Payment) {
    if (busy) return
    setBusy(p.id)
    try {
      await apiFetch(`/api/admin/billing/${p.id}/refund`, { method: 'POST' })
      toast.success('Paiement marqué comme remboursé')
      setToRefund(null)
      await mutate()
    } catch (e) {
      setToRefund(null)
      toastError(e, 'Remboursement impossible')
    } finally {
      setBusy(null)
    }
  }

  return (
    <PageShell>
      <PageIntro title="Facturation" description="Historique des paiements d’abonnement" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="Revenu total"
          value={summary ? formatMoney(summary.revenueTotal) : '—'}
          emphasis
        />
        <StatCard
          icon={Calendar}
          label="Ce mois-ci"
          value={summary ? formatMoney(summary.revenueMonth) : '—'}
          tone="brand"
        />
        <StatCard
          icon={CheckCircle2}
          label="Paiements complétés"
          value={formatNumber(summary?.completed ?? 0)}
          tone="success"
        />
        <StatCard
          icon={XCircle}
          label="Paiements échoués"
          value={formatNumber(summary?.failed ?? 0)}
          hint={`${formatNumber(summary?.refunded ?? 0)} remboursé(s)`}
          tone="danger"
        />
      </div>

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
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                    <td className="tabular whitespace-nowrap px-5 py-3 text-muted-foreground">
                      {formatDate(p.created_at)}
                    </td>
                    <td className="px-5 py-3">
                      {p.company_id ? (
                        <Link href={`/admin/companies/${p.company_id}`} className="text-foreground hover:underline">
                          {p.company_name || '—'}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{p.company_name || 'Supprimée'}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-foreground">
                      {p.plan_name || '—'}
                      <span className="text-xs text-muted-foreground"> · {p.provider}</span>
                    </td>
                    <td className="tabular whitespace-nowrap px-5 py-3 text-right font-medium text-foreground">{formatMoney(p.amount)}</td>
                    <td className="px-5 py-3">
                      <PaymentStatusBadge status={p.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      {p.status === 'completed' && Number(p.amount) > 0 && (
                        <Button size="sm" variant="outline" onClick={() => setToRefund(p)} disabled={busy === p.id}>
                          {busy === p.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Rembourser
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
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

      <AlertDialog open={!!toRefund} onOpenChange={(o) => !o && !busy && setToRefund(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marquer ce paiement comme remboursé ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le paiement de {toRefund ? formatMoney(toRefund.amount) : ''}
              {toRefund?.company_name ? ` (${toRefund.company_name})` : ''} passera au statut « Remboursé » et
              sortira du revenu. Aucun remboursement n’est effectué automatiquement : le reversement des fonds
              doit être fait chez le prestataire de paiement. L’abonnement de l’entreprise n’est pas modifié.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!busy}
              onClick={(e) => {
                e.preventDefault()
                if (toRefund) refund(toRefund)
              }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Marquer remboursé
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
