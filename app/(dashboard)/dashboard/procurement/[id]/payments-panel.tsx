'use client'

import { useCallback, useEffect, useState } from 'react'
import { Banknote, CalendarClock, Loader2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Panel, StatusBadge } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ErrorState, TableSkeleton } from '@/components/states'
import { apiFetch, errorMessage, toastError, toastWarnings } from '@/lib/api-client'
import { formatDate, formatMoney } from '@/lib/format'
import {
  PAYABLE_STATUS,
  paymentMethodLabel,
  SupplierPaymentDialog,
  type Payable,
} from '@/components/procurement/supplier-payment-dialog'

type Payment = {
  id: string
  payment_number: string
  amount: number
  payment_method: string
  reference: string | null
  notes: string | null
  paid_at: string
  status: 'completed' | 'cancelled'
  cash_movement_id: string | null
  cancel_reason: string | null
  created_by_name: string | null
}

type Data = { payable: Payable | null; orderStatus: string; payments: Payment[] }

function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular font-medium text-foreground ${className ?? ''}`}>{children}</span>
    </div>
  )
}

/** Dette et règlements d'un bon de commande (fiche commande). */
export function PaymentsPanel({ orderId }: { orderId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Payment | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [dueOpen, setDueOpen] = useState(false)
  const [dueValue, setDueValue] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await apiFetch<{ data: Data }>(`/api/procurement/${orderId}/payments`)
      setData(res.data)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [orderId])

  useEffect(() => {
    load()
  }, [load])

  async function cancelPayment() {
    if (!cancelTarget || busy) return
    setBusy(true)
    try {
      const res = await apiFetch<{ message?: string; warnings?: unknown }>(
        `/api/procurement/${orderId}/payments/${cancelTarget.id}/cancel`,
        { method: 'POST', body: { reason: cancelReason || null } }
      )
      toast.success(res.message || 'Règlement annulé')
      toastWarnings(res.warnings)
      setCancelTarget(null)
      setCancelReason('')
      load()
    } catch (e) {
      toastError(e, 'Annulation impossible')
    } finally {
      setBusy(false)
    }
  }

  async function saveDueDate(value: string | null) {
    if (busy) return
    setBusy(true)
    try {
      const res = await apiFetch<{ message?: string }>(`/api/procurement/${orderId}/payments/due-date`, {
        method: 'PUT',
        body: { dueDate: value },
      })
      toast.success(res.message || 'Échéance mise à jour')
      setDueOpen(false)
      load()
    } catch (e) {
      toastError(e, 'Échéance non modifiée')
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <Panel title="Paiement fournisseur" bodyClassName="p-5">
        <ErrorState title="Impossible de charger les règlements" description={error} onRetry={load} />
      </Panel>
    )
  }
  if (!data) {
    return (
      <Panel title="Paiement fournisseur" bodyClassName="p-5">
        <TableSkeleton rows={3} columns={2} />
      </Panel>
    )
  }

  const p = data.payable
  const status = p ? PAYABLE_STATUS[p.payment_status] : null

  return (
    <Panel
      title="Paiement fournisseur"
      description="Dette sur les quantités reçues"
      action={status ? <StatusBadge label={status.label} tone={status.tone} /> : undefined}
      bodyClassName="space-y-3 p-5"
    >
      {!p ? (
        <p className="text-sm text-muted-foreground">
          {data.orderStatus === 'cancelled'
            ? 'Commande annulée : aucune dette.'
            : 'Aucune dette pour le moment : elle naît à la réception des marchandises.'}
        </p>
      ) : (
        <>
          <Row label="Valeur commandée">{formatMoney(p.ordered_value)}</Row>
          <Row label="Valeur reçue">{formatMoney(p.received_value)}</Row>
          {p.returned_value > 0 && <Row label="Retours fournisseur" className="text-info">−{formatMoney(p.returned_value)}</Row>}
          {p.ordered_value !== p.received_value && (
            <p className="text-xs text-muted-foreground">
              Écart commandé / reçu : {formatMoney(p.ordered_value - p.received_value)} non facturable tant que non reçu.
            </p>
          )}
          <Separator />
          <Row label="Montant dû">{formatMoney(p.amount_due)}</Row>
          <Row label="Déjà payé" className="text-success">{formatMoney(p.paid_amount)}</Row>
          <Row label="Reste à payer" className={p.remaining > 0 ? 'text-base text-destructive' : 'text-base'}>
            {formatMoney(p.remaining)}
          </Row>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Échéance</span>
            <span className="flex items-center gap-2">
              <span className={`tabular font-medium ${p.payment_status === 'overdue' ? 'text-destructive' : 'text-foreground'}`}>
                {p.due_date ? formatDate(p.due_date) : '—'}
                {p.days_overdue > 0 && <span className="text-xs font-normal"> · {p.days_overdue} j de retard</span>}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 print:hidden"
                aria-label="Modifier l'échéance"
                title="Modifier l'échéance"
                onClick={() => {
                  setDueValue(p.due_date ?? '')
                  setDueOpen(true)
                }}
              >
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
              </Button>
            </span>
          </div>
          {p.remaining > 0 && (
            <Button variant="brand" className="w-full print:hidden" onClick={() => setPayOpen(true)}>
              <Banknote className="h-4 w-4" aria-hidden="true" /> Régler le fournisseur
            </Button>
          )}
        </>
      )}

      {data.payments.length > 0 && (
        <>
          <Separator />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Règlements</p>
          <ul className="space-y-2">
            {data.payments.map((pay) => (
              <li key={pay.id} className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <div className="min-w-0 text-sm">
                  <p className="font-mono text-xs text-muted-foreground">{pay.payment_number}</p>
                  <p className={`tabular font-medium ${pay.status === 'cancelled' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                    {formatMoney(pay.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {paymentMethodLabel(pay.payment_method)} · {formatDate(pay.paid_at)}
                    {pay.reference ? ` · ${pay.reference}` : ''}
                  </p>
                  {pay.status === 'cancelled' && (
                    <p className="text-xs text-destructive">Annulé{pay.cancel_reason ? ` : ${pay.cancel_reason}` : ''}</p>
                  )}
                </div>
                {pay.status === 'completed' && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive print:hidden"
                    aria-label={`Annuler le règlement ${pay.payment_number}`}
                    title="Annuler ce règlement"
                    onClick={() => setCancelTarget(pay)}
                  >
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <SupplierPaymentDialog target={payOpen && p ? p : null} onClose={() => setPayOpen(false)} onPaid={load} />

      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && !busy && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler le règlement {cancelTarget?.payment_number} ?</DialogTitle>
            <DialogDescription>
              Le reste à payer de la commande est rétabli de {formatMoney(cancelTarget?.amount)}.
              {cancelTarget?.cash_movement_id
                ? ' Le paiement ayant été fait en espèces, une entrée de contre-passation est passée dans la caisse ouverte.'
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Motif (facultatif)</Label>
            <Input id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={500} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={busy}>
                Retour
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={cancelPayment} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Annuler le règlement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dueOpen} onOpenChange={(o) => !busy && setDueOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Échéance de paiement</DialogTitle>
            <DialogDescription>
              Par défaut : date de réception + conditions de paiement du fournisseur. Saisissez une autre date si la
              facture du fournisseur le prévoit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="due-date">Date d&apos;échéance</Label>
            <Input id="due-date" type="date" value={dueValue} onChange={(e) => setDueValue(e.target.value)} />
          </div>
          <DialogFooter className="gap-2">
            {p?.due_date_overridden && (
              <Button variant="ghost" onClick={() => saveDueDate(null)} disabled={busy}>
                Revenir au calcul automatique
              </Button>
            )}
            <Button variant="brand" onClick={() => saveDueDate(dueValue || null)} disabled={busy || !dueValue}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  )
}
