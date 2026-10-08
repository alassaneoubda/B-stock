'use client'

import { useEffect, useState } from 'react'
import { Banknote, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { apiFetch, toastError, toastWarnings } from '@/lib/api-client'
import { formatMoney } from '@/lib/format'

type Tone = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

/** Statuts de dette fournisseur (miroir de lib/domain/payables.ts, utilisable côté client). */
export const PAYABLE_STATUS: Record<string, { label: string; tone: Tone }> = {
  unpaid: { label: 'Non payé', tone: 'warning' },
  partial: { label: 'Partiel', tone: 'brand' },
  paid: { label: 'Payé', tone: 'success' },
  overdue: { label: 'En retard', tone: 'danger' },
}

export const SUPPLIER_PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: 'cash', label: 'Espèces' },
  { value: 'bank_transfer', label: 'Virement' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'check', label: 'Chèque' },
]

export const paymentMethodLabel = (m: string) => SUPPLIER_PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m

/** Ligne de dette renvoyée par les API (voir PayableRow côté serveur). */
export type Payable = {
  purchase_order_id: string
  order_number: string
  order_status: string
  supplier_id: string | null
  supplier_name: string | null
  depot_name: string | null
  ordered_at: string
  received_on: string | null
  ordered_value: number
  received_value: number
  returned_value: number
  amount_due: number
  paid_amount: number
  remaining: number
  due_date: string | null
  due_date_overridden: boolean
  days_overdue: number
  due_soon: boolean
  payment_status: 'unpaid' | 'partial' | 'paid' | 'overdue'
}

export type PaymentTarget = Pick<
  Payable,
  'purchase_order_id' | 'order_number' | 'supplier_name' | 'amount_due' | 'paid_amount' | 'remaining'
>

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Règlement (partiel ou total) d'un bon de commande fournisseur. */
export function SupplierPaymentDialog({
  target,
  onClose,
  onPaid,
}: {
  target: PaymentTarget | null
  onClose: () => void
  onPaid: () => void
}) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [paidAt, setPaidAt] = useState(todayIso())
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (target) {
      setAmount(String(target.remaining))
      setMethod('cash')
      setReference('')
      setNotes('')
      setPaidAt(todayIso())
    }
  }, [target])

  const value = Number(amount)
  const tooMuch = target ? value > target.remaining : false

  async function submit() {
    if (!target || submitting || !(value > 0) || tooMuch) return
    setSubmitting(true)
    try {
      const res = await apiFetch<{ message?: string; warnings?: unknown }>(
        `/api/procurement/${target.purchase_order_id}/payments`,
        { method: 'POST', body: { amount: value, method, reference: reference || null, notes: notes || null, paidAt } }
      )
      toast.success(res.message || `Règlement de ${formatMoney(value)} enregistré`)
      toastWarnings(res.warnings)
      onPaid()
      onClose()
    } catch (e) {
      toastError(e, 'Règlement non enregistré')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Régler le fournisseur</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{target?.order_number}</span>
            {target?.supplier_name ? ` — ${target.supplier_name}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <dl className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Montant dû (marchandises reçues)</dt>
              <dd className="tabular text-foreground">{formatMoney(target?.amount_due)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Déjà payé</dt>
              <dd className="tabular text-success">{formatMoney(target?.paid_amount)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
              <dt className="text-foreground">Reste à payer</dt>
              <dd className="tabular text-destructive">{formatMoney(target?.remaining)}</dd>
            </div>
          </dl>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="sp-amount">Montant réglé (FCFA)</Label>
              <Input
                id="sp-amount"
                type="number"
                min={1}
                max={target?.remaining}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tabular h-11 text-lg font-semibold"
                aria-invalid={tooMuch}
              />
              {tooMuch && <p className="text-xs text-destructive">Le montant dépasse le reste à payer.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sp-method">Mode de paiement</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="sp-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPLIER_PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sp-date">Date du règlement</Label>
              <Input id="sp-date" type="date" value={paidAt} max={todayIso()} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            {method !== 'cash' && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sp-ref">
                  {method === 'check' ? 'N° de chèque' : method === 'bank_transfer' ? 'Référence du virement' : 'Référence de la transaction'}
                </Label>
                <Input id="sp-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
              </div>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="sp-notes">Notes (facultatif)</Label>
              <Textarea id="sp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
            </div>
          </div>
          {method === 'cash' && (
            <p className="text-xs text-muted-foreground">
              Paiement en espèces : la sortie est enregistrée automatiquement dans la caisse ouverte.
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>
              Annuler
            </Button>
          </DialogClose>
          <Button variant="brand" onClick={submit} disabled={submitting || !(value > 0) || tooMuch}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Banknote className="h-4 w-4" aria-hidden="true" />
            )}
            Enregistrer le règlement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
