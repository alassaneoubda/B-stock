'use client'

import { useState } from 'react'
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
import { Loader2, Search, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Webhook } from 'lucide-react'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatDateTime, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'

const fetcher = (url: string) => apiFetch(url)

type Event = {
  id: string
  provider: string
  event_type: string | null
  reference: string | null
  signature_valid: boolean | null
  status: string
  error: string | null
  created_at: string
  processed_at: string | null
}

const statusFilters = [
  { value: '', label: 'Tous' },
  { value: 'processed', label: 'Traités' },
  { value: 'failed', label: 'Échoués' },
  { value: 'replayed', label: 'Rejoués' },
]

export default function AdminWebhooksPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const [toReplay, setToReplay] = useState<Event | null>(null)

  const qs = new URLSearchParams({ search, status, page: String(page) }).toString()
  const { data, error, isLoading, mutate } = useSWR<{
    data: Event[]
    summary: { processed: number; failed: number; replayed: number; total: number }
    pagination: { page: number; pages: number; total: number }
  }>(`/api/admin/webhooks?${qs}`, fetcher)

  const events = data?.data || []
  const summary = data?.summary
  const pagination = data?.pagination

  async function replay(ev: Event) {
    if (busy) return
    setBusy(ev.id)
    try {
      const json = await apiFetch<{ alreadyApplied?: boolean }>(`/api/admin/webhooks/${ev.id}/replay`, {
        method: 'POST',
      })
      if (json.alreadyApplied) toast.info('Paiement déjà appliqué : rien n’a été modifié.')
      else toast.success('Événement rejoué avec succès')
      setToReplay(null)
      await mutate()
    } catch (e) {
      setToReplay(null)
      toastError(e, 'Rejeu impossible')
    } finally {
      setBusy(null)
    }
  }

  return (
    <PageShell>
      <PageIntro title="Webhooks GeniusPay" description="Événements reçus, diagnostic et rejeu" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Webhook} label="Total" value={formatNumber(summary?.total ?? 0)} />
        <StatCard icon={CheckCircle2} label="Traités" value={formatNumber(summary?.processed ?? 0)} tone="success" />
        <StatCard icon={XCircle} label="Échoués" value={formatNumber(summary?.failed ?? 0)} tone="danger" />
        <StatCard icon={RefreshCw} label="Rejoués" value={formatNumber(summary?.replayed ?? 0)} tone="info" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Rechercher (référence, type)…"
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
        ) : events.length === 0 ? (
          <EmptyState
            className="m-5"
            icon={Webhook}
            title="Aucun événement"
            description={search || status ? 'Aucun événement ne correspond à ces filtres.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Référence</th>
                  <th className="px-5 py-3 font-medium">Signature</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                    <td className="tabular whitespace-nowrap px-5 py-3 text-muted-foreground">
                      {formatDateTime(e.created_at)}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-foreground">{e.event_type || '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{e.reference || '—'}</td>
                    <td className="px-5 py-3">
                      {e.signature_valid === true ? (
                        <CheckCircle2 className="h-4 w-4 text-success" aria-label="Signature valide" />
                      ) : e.signature_valid === false ? (
                        <XCircle className="h-4 w-4 text-destructive" aria-label="Signature invalide" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <EventStatusBadge status={e.status} />
                      {e.error && (
                        <p className="mt-1 max-w-[220px] truncate text-xs text-destructive" title={e.error}>
                          {e.error}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {e.event_type === 'payment.success' && (
                        <Button size="sm" variant="outline" onClick={() => setToReplay(e)} disabled={!!busy}>
                          {busy === e.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Rejouer
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

      <AlertDialog open={!!toReplay} onOpenChange={(o) => !o && !busy && setToReplay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejouer cet événement webhook ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le paiement {toReplay?.reference ? `« ${toReplay.reference} » ` : ''}sera traité à nouveau : s’il
              n’a pas encore été appliqué, l’abonnement de l’entreprise sera activé ou prolongé. Un paiement déjà
              appliqué ne l’est jamais deux fois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!busy}
              onClick={(ev) => {
                ev.preventDefault()
                if (toReplay) replay(toReplay)
              }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Rejouer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}

function EventStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: 'success' | 'danger' | 'info' | 'default' }> = {
    processed: { label: 'Traité', tone: 'success' },
    failed: { label: 'Échoué', tone: 'danger' },
    replayed: { label: 'Rejoué', tone: 'info' },
    received: { label: 'Reçu', tone: 'default' },
    ignored: { label: 'Ignoré', tone: 'default' },
  }
  const s = map[status] || { label: status, tone: 'default' as const }
  return <StatusBadge label={s.label} tone={s.tone} />
}
