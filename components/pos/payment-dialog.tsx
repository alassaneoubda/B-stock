'use client'

import { useEffect, useMemo, useState } from 'react'
import { Banknote, BookUser, Loader2, Smartphone, Split } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format'

export type PaymentMethod = 'cash' | 'mobile_money' | 'credit' | 'mixed'

const METHODS: { id: PaymentMethod; label: string; icon: typeof Banknote; hint: string }[] = [
  { id: 'cash', label: 'Espèces', icon: Banknote, hint: 'Monnaie calculée' },
  { id: 'mobile_money', label: 'Mobile Money', icon: Smartphone, hint: 'Wave, Orange, MTN, Moov' },
  { id: 'credit', label: 'Ardoise', icon: BookUser, hint: 'Payé plus tard' },
  { id: 'mixed', label: 'Partiel', icon: Split, hint: 'Une partie maintenant' },
]

/** Billets usuels en FCFA pour les montants rapides. */
function quickAmounts(total: number): number[] {
  const steps = [500, 1000, 2000, 5000, 10000]
  const set = new Set<number>([total])
  for (const step of steps) {
    const rounded = Math.ceil(total / step) * step
    if (rounded > total) set.add(rounded)
  }
  return [...set].sort((a, b) => a - b).slice(0, 5)
}

export function PaymentDialog({
  open,
  total,
  hasClient,
  clientName,
  submitting,
  allowedMethods,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  total: number
  hasClient: boolean
  clientName: string | null
  submitting: boolean
  /** Modes proposés (hors ligne : espèces et Mobile Money uniquement). Par défaut : tous. */
  allowedMethods?: PaymentMethod[]
  onOpenChange: (open: boolean) => void
  onConfirm: (input: { paymentMethod: PaymentMethod; paidAmount: number; cashAmount?: number; received: number }) => void
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [received, setReceived] = useState('')
  const [partial, setPartial] = useState('')

  useEffect(() => {
    if (open) {
      setMethod('cash')
      setReceived('')
      setPartial('')
    }
  }, [open])

  const receivedNum = received === '' ? total : Number(received)
  const change = method === 'cash' ? Math.max(0, receivedNum - total) : 0
  const partialNum = Number(partial || 0)
  const quick = useMemo(() => quickAmounts(total), [total])

  const error =
    method === 'cash' && receivedNum < total
      ? `Il manque ${formatMoney(total - receivedNum)}`
      : (method === 'credit' || method === 'mixed') && !hasClient
        ? 'Rattachez d’abord un client au ticket (menu ⋯ du ticket)'
        : method === 'mixed' && (partialNum <= 0 || partialNum >= total)
          ? 'Saisissez un montant inférieur au total'
          : null

  function confirm() {
    if (error) return
    if (method === 'cash') onConfirm({ paymentMethod: 'cash', paidAmount: total, received: receivedNum })
    else if (method === 'mobile_money') onConfirm({ paymentMethod: 'mobile_money', paidAmount: total, received: total })
    else if (method === 'credit') onConfirm({ paymentMethod: 'credit', paidAmount: 0, received: 0 })
    else onConfirm({ paymentMethod: 'mixed', paidAmount: partialNum, cashAmount: partialNum, received: partialNum })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="gap-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Encaisser</DialogTitle>
          <DialogDescription>Choisissez le mode de paiement.</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-muted px-5 py-4 text-center">
          <p className="text-sm text-muted-foreground">À payer</p>
          <p className="tabular text-4xl font-semibold tracking-tight text-foreground">{formatMoney(total)}</p>
        </div>

        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Mode de paiement">
          {METHODS.filter((m) => !allowedMethods || allowedMethods.includes(m.id)).map(({ id, label, icon: Icon, hint }) => {
            const needsClient = (id === 'credit' || id === 'mixed') && !hasClient
            return (
              <button
                key={id}
                role="radio"
                aria-checked={method === id}
                onClick={() => setMethod(id)}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                  method === id ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:border-foreground/30',
                  needsClient && method !== id && 'opacity-60'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className={cn('block truncate text-xs', method === id ? 'text-background/70' : 'text-muted-foreground')}>
                    {needsClient ? 'Client requis' : hint}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {method === 'cash' && (
          <div className="space-y-3">
            <Label htmlFor="received">Montant reçu</Label>
            <Input
              id="received"
              inputMode="numeric"
              value={received}
              placeholder={String(total)}
              onChange={(e) => setReceived(e.target.value.replace(/[^\d]/g, ''))}
              className="tabular h-12 text-lg"
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              {quick.map((amount) => (
                <button
                  key={amount}
                  onClick={() => setReceived(String(amount))}
                  className="tabular h-10 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:border-foreground/30"
                >
                  {amount === total ? 'Compte juste' : formatMoney(amount)}
                </button>
              ))}
            </div>
            <div className="flex items-baseline justify-between rounded-xl border border-success/30 bg-success-soft px-4 py-3">
              <span className="text-sm font-medium text-foreground">Monnaie à rendre</span>
              <span className="tabular text-2xl font-semibold text-success">{formatMoney(change)}</span>
            </div>
          </div>
        )}

        {method === 'mobile_money' && (
          <p className="rounded-xl bg-info-soft px-4 py-3 text-sm text-foreground">
            Vérifiez la confirmation du paiement de <strong className="tabular">{formatMoney(total)}</strong> sur le
            téléphone avant de valider.
          </p>
        )}

        {method === 'credit' && hasClient && (
          <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-foreground">
            <strong className="tabular">{formatMoney(total)}</strong> seront ajoutés à l’ardoise de{' '}
            <strong>{clientName}</strong>. Le plafond de crédit du client est vérifié.
          </p>
        )}

        {method === 'mixed' && hasClient && (
          <div className="space-y-2">
            <Label htmlFor="partial">Montant payé maintenant (espèces)</Label>
            <Input
              id="partial"
              inputMode="numeric"
              value={partial}
              onChange={(e) => setPartial(e.target.value.replace(/[^\d]/g, ''))}
              className="tabular h-12 text-lg"
              autoFocus
            />
            {partialNum > 0 && partialNum < total && (
              <p className="text-sm text-muted-foreground">
                Reste sur l’ardoise de {clientName} :{' '}
                <strong className="tabular text-foreground">{formatMoney(total - partialNum)}</strong>
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}

        <Button variant="brand" size="xl" onClick={confirm} disabled={Boolean(error) || submitting} className="w-full">
          {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
          Valider le paiement
        </Button>
      </DialogContent>
    </Dialog>
  )
}
