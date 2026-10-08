'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CloudUpload, Loader2, Minus, Plus, RotateCcw, Trash2, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format'
import { correctSaleLines, type OfflineSale, type PosSalePayload } from '@/lib/offline/queue'
import type { OfflineSalesState } from './use-offline-sales'

function plural(n: number, one: string, many: string) {
  return `${n} ${n > 1 ? many : one}`
}

const PAYMENT_LABELS = { cash: 'Espèces', mobile_money: 'Mobile Money' } as const

/**
 * Bandeau d'état hors ligne : coupure réseau, ventes en attente (compteur +
 * « Envoyer maintenant ») et ventes refusées à vérifier.
 */
export function OfflineStatusBar({
  state,
  onReview,
  className,
}: {
  state: Pick<OfflineSalesState, 'offline' | 'pendingCount' | 'rejected' | 'syncing' | 'syncNow'>
  onReview: () => void
  className?: string
}) {
  const { offline, pendingCount, rejected, syncing, syncNow } = state
  if (!offline && pendingCount === 0 && rejected.length === 0) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-sm',
        offline ? 'border-warning/30 bg-warning-soft text-warning-foreground' : 'border-border bg-muted/60 text-foreground',
        className
      )}
    >
      {offline ? (
        <span className="flex items-center gap-2 font-medium">
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          Hors ligne — les ventes seront envoyées au retour du réseau
        </span>
      ) : (
        <span className="flex items-center gap-2 font-medium">
          <CloudUpload className="h-4 w-4 shrink-0" aria-hidden="true" />
          Réseau rétabli
        </span>
      )}
      {pendingCount > 0 && (
        <span className="tabular rounded-full bg-background/70 px-2.5 py-0.5 text-xs font-semibold text-foreground">
          {plural(pendingCount, 'vente en attente', 'ventes en attente')}
        </span>
      )}
      <span className="ml-auto flex items-center gap-2">
        {rejected.length > 0 && (
          <Button size="sm" variant="destructive" onClick={onReview}>
            <AlertTriangle aria-hidden="true" />
            {plural(rejected.length, 'vente à vérifier', 'ventes à vérifier')}
          </Button>
        )}
        {pendingCount > 0 && (
          <>
            <Button size="sm" variant="ghost" onClick={onReview}>
              Détail
            </Button>
            <Button size="sm" variant="outline" onClick={() => void syncNow(true)} disabled={syncing}>
              {syncing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CloudUpload aria-hidden="true" />}
              Envoyer maintenant
            </Button>
          </>
        )}
      </span>
    </div>
  )
}

function SaleCard({
  sale,
  onRetry,
  onDiscard,
}: {
  sale: OfflineSale
  onRetry?: (patch?: Partial<Pick<OfflineSale, 'payload' | 'summary'>>) => Promise<void>
  onDiscard?: () => Promise<void>
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [busy, setBusy] = useState(false)
  const rejected = sale.status === 'rejected'
  const edited = Object.keys(quantities).length > 0
  const corrected = edited ? correctSaleLines(sale, quantities) : sale
  const canAcceptPrices = rejected && sale.kind === 'pos' && sale.rejection?.code === 'PRICE_CHANGED'

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={cn('space-y-3 rounded-xl border p-4', rejected ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{sale.summary.label}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(sale.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
            {PAYMENT_LABELS[sale.summary.paymentMethod]}
            {sale.summary.depotName ? ` · ${sale.summary.depotName}` : ''}
          </p>
        </div>
        <span className="tabular shrink-0 font-semibold text-foreground">{formatMoney(corrected.summary.total)}</span>
      </div>

      {rejected && sale.rejection && (
        <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {sale.rejection.message}
        </p>
      )}
      {!rejected && sale.lastError && (
        <p className="text-xs text-muted-foreground">Dernier essai : {sale.lastError}</p>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border bg-background text-sm">
        {sale.summary.lines.map((line) => {
          const qty = quantities[line.variantId] ?? line.quantity
          return (
            <li key={line.variantId} className="flex items-center gap-2 px-3 py-2">
              <span className={cn('min-w-0 flex-1 truncate', qty === 0 && 'line-through text-muted-foreground')}>{line.name}</span>
              {rejected ? (
                <span className="flex items-center rounded-full border border-border">
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent disabled:opacity-40"
                    onClick={() => setQuantities((q) => ({ ...q, [line.variantId]: Math.max(0, qty - 1) }))}
                    disabled={qty === 0}
                    aria-label={`Retirer un ${line.name}`}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="tabular w-7 text-center font-semibold">{qty}</span>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent disabled:opacity-40"
                    onClick={() => setQuantities((q) => ({ ...q, [line.variantId]: qty + 1 }))}
                    disabled={qty >= line.quantity}
                    aria-label={`Remettre un ${line.name}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : (
                <span className="tabular text-muted-foreground">× {line.quantity}</span>
              )}
              <span className="tabular w-24 text-right">{formatMoney(qty * line.unitPrice)}</span>
            </li>
          )
        })}
      </ul>

      {rejected && onRetry && onDiscard && (
        <div className="flex flex-wrap justify-end gap-2">
          {confirmDiscard ? (
            <>
              <span className="mr-auto self-center text-xs text-destructive">
                La vente sera supprimée de cet appareil sans être enregistrée.
              </span>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDiscard(false)} disabled={busy}>
                Garder
              </Button>
              <Button size="sm" variant="destructive" onClick={() => void run(onDiscard)} disabled={busy}>
                Confirmer l’abandon
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDiscard(true)} disabled={busy}>
                <Trash2 aria-hidden="true" /> Abandonner
              </Button>
              {canAcceptPrices && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || corrected.summary.lines.length === 0}
                  onClick={() =>
                    void run(() =>
                      onRetry({
                        summary: corrected.summary,
                        payload: { ...(corrected.payload as PosSalePayload), acceptCurrentPrices: true },
                      })
                    )
                  }
                >
                  Accepter les prix actuels
                </Button>
              )}
              <Button
                size="sm"
                disabled={busy || corrected.summary.lines.length === 0}
                onClick={() => void run(() => onRetry(edited ? { summary: corrected.summary, payload: corrected.payload } : undefined))}
              >
                {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                {edited ? 'Corriger et renvoyer' : 'Réessayer'}
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  )
}

/** « Ventes à vérifier » (refusées) et ventes en attente d'envoi. */
export function OfflineReviewDialog({
  open,
  onOpenChange,
  state,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: Pick<OfflineSalesState, 'pending' | 'rejected' | 'retry' | 'discard' | 'syncing' | 'syncNow' | 'offline'>
}) {
  const { pending, rejected, retry, discard, syncing, syncNow, offline } = state
  useEffect(() => {
    if (open && pending.length === 0 && rejected.length === 0) onOpenChange(false)
  }, [open, pending.length, rejected.length, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ventes hors ligne</DialogTitle>
          <DialogDescription>
            Les ventes en attente partent automatiquement, dans l’ordre, dès que le réseau revient. Une vente refusée par
            le serveur reste ici jusqu’à ce que vous la corrigiez ou l’abandonniez.
          </DialogDescription>
        </DialogHeader>

        {rejected.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-destructive">Ventes à vérifier ({rejected.length})</h3>
            <ul className="space-y-3">
              {rejected.map((sale) => (
                <SaleCard
                  key={sale.id}
                  sale={sale}
                  onRetry={(patch) => retry(sale.id, patch)}
                  onDiscard={() => discard(sale.id)}
                />
              ))}
            </ul>
          </section>
        )}

        {pending.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">En attente d’envoi ({pending.length})</h3>
              <Button size="sm" variant="outline" onClick={() => void syncNow(true)} disabled={syncing || offline}>
                {syncing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CloudUpload aria-hidden="true" />}
                Envoyer maintenant
              </Button>
            </div>
            <ul className="space-y-3">
              {pending.map((sale) => (
                <SaleCard key={sale.id} sale={sale} />
              ))}
            </ul>
          </section>
        )}
      </DialogContent>
    </Dialog>
  )
}
