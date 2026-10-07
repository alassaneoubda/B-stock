'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Webhooks GeniusPay</h1>
        <p className="text-sm text-muted-foreground">Événements reçus, diagnostic et rejeu</p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Mini label="Total" value={summary?.total ?? 0} />
        <Mini label="Traités" value={summary?.processed ?? 0} tone="green" />
        <Mini label="Échoués" value={summary?.failed ?? 0} tone="red" />
        <Mini label="Rejoués" value={summary?.replayed ?? 0} tone="blue" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
          <Input
            placeholder="Rechercher (référence, type)…"
            className="pl-9 h-10"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="flex gap-1.5">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setStatus(f.value)
                setPage(1)
              }}
              className={`px-3 h-10 rounded-lg text-sm font-medium transition-colors ${
                status === f.value
                  ? 'bg-primary text-white'
                  : 'bg-card text-muted-foreground hover:bg-muted border border-border'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
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
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
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
                  <tr key={e.id} className="border-b border-border hover:bg-muted/50">
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDateTime(e.created_at)}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-foreground/80">{e.event_type || '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{e.reference || '—'}</td>
                    <td className="px-5 py-3">
                      {e.signature_valid === true ? (
                        <CheckCircle2 className="h-4 w-4 text-success" aria-label="Signature valide" />
                      ) : e.signature_valid === false ? (
                        <XCircle className="h-4 w-4 text-destructive" aria-label="Signature invalide" />
                      ) : (
                        <span className="text-muted-foreground/70">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={e.status} />
                      {e.error && (
                        <p className="text-xs text-destructive mt-0.5 max-w-[200px] truncate" title={e.error}>
                          {e.error}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {e.event_type === 'payment.success' && (
                        <Button size="sm" variant="outline" onClick={() => setToReplay(e)} disabled={!!busy}>
                          {busy === e.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
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
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} / {pagination.pages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Page précédente"
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted/50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Page suivante"
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted/50"
            >
              <ChevronRight className="h-4 w-4" />
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
              {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Rejouer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'red' | 'blue' }) {
  const tones: Record<string, string> = {
    green: 'text-success',
    red: 'text-destructive',
    blue: 'text-brand-strong',
  }
  return (
    <Card className="p-4">
      <p className={`text-2xl font-bold ${tone ? tones[tone] : 'text-foreground'}`}>{formatNumber(value)}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    processed: 'bg-success-soft text-success hover:bg-success-soft',
    failed: 'bg-destructive/10 text-destructive hover:bg-destructive/10',
    replayed: 'bg-brand-soft text-brand-strong hover:bg-brand-soft',
    received: 'bg-muted text-muted-foreground hover:bg-muted',
    ignored: 'bg-muted text-muted-foreground hover:bg-muted',
  }
  return <Badge className={map[status] || 'bg-muted text-muted-foreground'}>{status}</Badge>
}
