'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Clock, Loader2, RefreshCw, TimerOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { Panel, StatusBadge } from '@/components/app/blocks'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatDateTime, formatMoney, formatRelative } from '@/lib/format'

export type Checkout = {
  id: string
  reference: string
  plan_name: string
  months: number
  amount: string
  status: string
  provider_status: string | null
  check_attempts: number
  last_checked_at: string | null
  created_at: string
  company_id: string
  company_name: string
}

/** Au-delà d'une heure, un paiement initié peut être clôturé à la main. */
const STALE_MS = 60 * 60 * 1000

const STATUS_LABEL: Record<string, string> = {
  completed: 'Paiement confirmé : abonnement activé',
  failed: 'Paiement refusé chez le prestataire',
  expired: 'Paiement expiré',
}

export function PendingCheckouts({ canWrite, onChange }: { canWrite: boolean; onChange: () => void }) {
  const { data, error, isLoading, mutate } = useSWR<{ data: Checkout[] }>(
    '/api/admin/billing/checkouts?status=pending',
    (url: string) => apiFetch(url)
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [toExpire, setToExpire] = useState<Checkout | null>(null)
  const rows = data?.data ?? []

  async function verify(c: Checkout) {
    if (busy) return
    setBusy(c.id)
    try {
      const r = await apiFetch<{ status: string; message?: string }>(`/api/admin/billing/checkouts/${c.id}/verify`, {
        method: 'POST',
      })
      if (r.status === 'pending') toast.info('Toujours en attente', { description: r.message })
      else if (r.status === 'completed') toast.success(STATUS_LABEL.completed)
      else toast.warning(STATUS_LABEL[r.status] ?? r.status)
      await mutate()
      if (r.status !== 'pending') onChange()
    } catch (e) {
      toastError(e, 'Vérification impossible')
    } finally {
      setBusy(null)
    }
  }

  async function expire(c: Checkout) {
    if (busy) return
    setBusy(c.id)
    try {
      await apiFetch(`/api/admin/billing/checkouts/${c.id}/expire`, { method: 'POST' })
      toast.success('Paiement marqué comme expiré')
      setToExpire(null)
      await mutate()
    } catch (e) {
      setToExpire(null)
      toastError(e, 'Action impossible')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel
      title="Paiements en attente"
      description="Paiements Mobile Money initiés mais pas encore confirmés par GeniusPay (rapprochés automatiquement toutes les 15 min)."
      action={
        <Button size="sm" variant="ghost" onClick={() => mutate()} aria-label="Actualiser la liste">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Actualiser
        </Button>
      }
    >
      {isLoading ? (
        <div className="p-5">
          <TableSkeleton columns={6} rows={3} />
        </div>
      ) : error ? (
        <ErrorState className="m-5" description={errorMessage(error)} onRetry={() => mutate()} />
      ) : rows.length === 0 ? (
        <EmptyState className="m-5" icon={Clock} title="Aucun paiement en attente" description="Tous les paiements initiés ont été rapprochés." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <th className="px-5 py-3 font-medium">Entreprise</th>
                <th className="px-5 py-3 font-medium">Plan</th>
                <th className="px-5 py-3 text-right font-medium">Montant</th>
                <th className="px-5 py-3 font-medium">Créé</th>
                <th className="px-5 py-3 font-medium">Dernière vérif.</th>
                <th className="px-5 py-3 text-right font-medium">Essais</th>
                <th className="px-5 py-3 font-medium">Prestataire</th>
                {canWrite && <th className="px-5 py-3 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const stale = Date.now() - new Date(c.created_at).getTime() > STALE_MS
                return (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-5 py-3">
                      <Link href={`/admin/companies/${c.company_id}`} className="text-foreground hover:underline">
                        {c.company_name}
                      </Link>
                      <div className="font-mono text-[11px] text-muted-foreground">{c.reference}</div>
                    </td>
                    <td className="px-5 py-3 text-foreground">{c.plan_name}</td>
                    <td className="tabular whitespace-nowrap px-5 py-3 text-right font-medium text-foreground">{formatMoney(c.amount)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-muted-foreground" title={formatDateTime(c.created_at)}>
                      {formatRelative(c.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                      {c.last_checked_at ? formatRelative(c.last_checked_at) : 'Jamais'}
                    </td>
                    <td className="tabular px-5 py-3 text-right text-muted-foreground">{c.check_attempts}</td>
                    <td className="px-5 py-3">
                      <StatusBadge label={c.provider_status || 'inconnu'} tone={stale ? 'warning' : 'info'} />
                    </td>
                    {canWrite && (
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => verify(c)} disabled={busy === c.id}>
                            {busy === c.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Vérifier maintenant
                          </Button>
                          {stale && (
                            <Button size="sm" variant="ghost" onClick={() => setToExpire(c)} disabled={busy === c.id}>
                              <TimerOff className="h-3.5 w-3.5" aria-hidden="true" />
                              Marquer expiré
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!toExpire} onOpenChange={(o) => !o && !busy && setToExpire(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marquer ce paiement comme expiré ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le paiement de {toExpire ? formatMoney(toExpire.amount) : ''} ({toExpire?.company_name}) ne sera plus
              rapproché automatiquement. Vérifiez-le d’abord : s’il a été payé chez GeniusPay, il faudra l’enregistrer
              manuellement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!busy}
              onClick={(e) => {
                e.preventDefault()
                if (toExpire) expire(toExpire)
              }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Marquer expiré
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  )
}

/** Nombre de paiements en attente (badge de l'onglet). */
export function usePendingCount() {
  const { data } = useSWR<{ data: Checkout[] }>('/api/admin/billing/checkouts?status=pending', (url: string) => apiFetch(url))
  return data?.data.length ?? 0
}
