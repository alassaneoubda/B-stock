'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Loader2, MessageCircle, RefreshCw, Smartphone, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/app/blocks'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatDateTime, formatMoney } from '@/lib/format'
import { MOBILE_MONEY_STATUS, paymentMessage, providerMethodLabel, whatsappLink } from '@/lib/mobile-money/labels'
import { cn } from '@/lib/utils'
import { PaymentQr } from './payment-qr'

export type MobileMoneyTarget =
  | {
      kind: 'sale'
      salesOrderId: string
      label: string
      remainingProducts: number
      remainingPackaging: number
    }
  | {
      kind: 'credit'
      creditNoteId: string
      label: string
      remaining: number
    }

export type MobileMoneyRequest = {
  id: string
  amount: string | number
  status: string
  payment_url: string | null
  provider_reference: string | null
  customer_phone: string | null
  description: string | null
  environment: 'sandbox' | 'production'
  provider_method: string | null
  paid_at: string | null
  applied_payment_id: string | null
  apply_error: string | null
  last_checked_at: string | null
  client_name?: string | null
  company_name?: string | null
  created_at: string
}

const POLL_MS = 5_000
const AUTO_VERIFY_MS = 30_000

export function MobileMoneyDialog({
  open,
  onOpenChange,
  target,
  clientName,
  clientPhone,
  initialRequest,
  onPaid,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target?: MobileMoneyTarget | null
  clientName?: string | null
  clientPhone?: string | null
  /** Ouvre directement une demande existante (suivi). */
  initialRequest?: MobileMoneyRequest | null
  /** Appelé une fois quand la demande est payée et imputée. */
  onPaid?: () => void
}) {
  const [accountType, setAccountType] = useState<'product' | 'packaging'>('product')
  const [amount, setAmount] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [request, setRequest] = useState<MobileMoneyRequest | null>(initialRequest ?? null)
  const [verifying, setVerifying] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const paidNotified = useRef(false)

  const maxFor = useCallback(
    (type: 'product' | 'packaging') => {
      if (!target) return 0
      if (target.kind === 'credit') return Math.max(Math.floor(target.remaining), 0)
      return Math.max(Math.floor(type === 'product' ? target.remainingProducts : target.remainingPackaging), 0)
    },
    [target]
  )

  // Réinitialisation à l'ouverture uniquement (pas à chaque rendu du parent)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      paidNotified.current = initialRequest?.status === 'paid'
      setFormError(null)
      setRequest(initialRequest ?? null)
      const type = target?.kind === 'sale' && target.remainingProducts <= 0 ? 'packaging' : 'product'
      setAccountType(type)
      setAmount(target ? String(maxFor(type)) : '')
      setPhone(clientPhone ?? '')
    }
    wasOpen.current = open
  }, [open, target, clientPhone, initialRequest, maxFor])

  const isPending = request?.status === 'pending'

  const requestId = request?.id
  const refresh = useCallback(async (verify: boolean) => {
    if (!requestId) return
    try {
      const res = await apiFetch<{ data: MobileMoneyRequest }>(
        `/api/payments/mobile-money/${requestId}${verify ? '/verify' : ''}`,
        { method: verify ? 'POST' : 'GET' }
      )
      setRequest((prev) => ({ ...res.data, client_name: res.data.client_name ?? prev?.client_name ?? null }))
    } catch (e) {
      if (verify) throw e
    }
  }, [requestId])

  // Statut en direct : lecture locale fréquente (webhook), revérification API espacée
  useEffect(() => {
    if (!open || !isPending) return
    const poll = setInterval(() => refresh(false), POLL_MS)
    const verify = setInterval(() => refresh(true).catch(() => {}), AUTO_VERIFY_MS)
    return () => {
      clearInterval(poll)
      clearInterval(verify)
    }
  }, [open, isPending, refresh])

  useEffect(() => {
    if (request?.status === 'paid' && request.applied_payment_id && !paidNotified.current) {
      paidNotified.current = true
      toast.success(`Paiement Mobile Money de ${formatMoney(Number(request.amount))} reçu et enregistré`)
      onPaid?.()
    }
  }, [request, onPaid])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!target || submitting) return
    setFormError(null)
    const value = Number(amount)
    const max = maxFor(accountType)
    if (!Number.isInteger(value) || value <= 0) {
      setFormError('Saisissez un montant entier en FCFA, supérieur à 0.')
      return
    }
    if (value > max) {
      setFormError(`Le montant ne peut pas dépasser le reste dû (${formatMoney(max)}).`)
      return
    }
    setSubmitting(true)
    try {
      const res = await apiFetch<{ data: MobileMoneyRequest }>('/api/payments/mobile-money', {
        method: 'POST',
        body: {
          amount: value,
          customerPhone: phone.trim() || null,
          ...(target.kind === 'sale'
            ? { salesOrderId: target.salesOrderId, accountType }
            : { creditNoteId: target.creditNoteId }),
        },
      })
      setRequest({ ...res.data, client_name: clientName ?? null })
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerify() {
    if (verifying) return
    setVerifying(true)
    try {
      await refresh(true)
    } catch (e) {
      toastError(e, 'Vérification impossible')
    } finally {
      setVerifying(false)
    }
  }

  async function handleCancel() {
    if (!request || cancelling) return
    setCancelling(true)
    try {
      const res = await apiFetch<{ data: MobileMoneyRequest }>(`/api/payments/mobile-money/${request.id}/cancel`, { method: 'POST' })
      setRequest(res.data)
      toast.success('Demande annulée')
    } catch (e) {
      toastError(e)
    } finally {
      setCancelling(false)
    }
  }

  async function copyLink() {
    if (!request?.payment_url) return
    try {
      await navigator.clipboard.writeText(request.payment_url)
      toast.success('Lien copié')
    } catch {
      toast.error('Copie impossible : sélectionnez le lien manuellement')
    }
  }

  const status = request ? MOBILE_MONEY_STATUS[request.status] ?? MOBILE_MONEY_STATUS.pending : null
  const message = request?.payment_url
    ? paymentMessage({
        clientName: request.client_name ?? clientName,
        companyName: request.company_name,
        description: request.description,
        amount: Number(request.amount),
        url: request.payment_url,
      })
    : ''

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o) }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-brand-strong" aria-hidden="true" />
            Paiement Mobile Money
          </DialogTitle>
          <DialogDescription>
            {request?.description ?? target?.label}
            {(request?.client_name ?? clientName) && <> — {request?.client_name ?? clientName}</>}
          </DialogDescription>
        </DialogHeader>

        {!request ? (
          <form id="mm-request-form" onSubmit={handleCreate} className="space-y-4">
            {target?.kind === 'sale' && target.remainingProducts > 0 && target.remainingPackaging > 0 && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-foreground">Dette à régler</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(['product', 'packaging'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => { setAccountType(type); setAmount(String(maxFor(type))) }}
                      aria-pressed={accountType === type}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                        accountType === type ? 'border-brand bg-brand-soft text-brand-strong' : 'border-border hover:bg-muted'
                      )}
                    >
                      <span className="block font-medium">{type === 'product' ? 'Produits' : 'Emballages'}</span>
                      <span className="tabular text-xs">{formatMoney(maxFor(type))}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="space-y-2">
              <Label htmlFor="mm-amount">Montant à demander (FCFA)</Label>
              <Input
                id="mm-amount"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                max={maxFor(accountType)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tabular h-11 text-lg font-semibold"
              />
              <p className="text-xs text-muted-foreground">Reste dû : {formatMoney(maxFor(accountType))}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mm-phone">Numéro du client (facultatif)</Label>
              <Input
                id="mm-phone"
                type="tel"
                inputMode="tel"
                placeholder="07 07 07 07 07"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Sert à préremplir WhatsApp. Le client choisit Wave, Orange Money, MTN MoMo ou Moov sur la page de paiement.
              </p>
            </div>
            {formError && (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {formError}
              </p>
            )}
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              <div>
                <p className="tabular text-lg font-semibold text-foreground">{formatMoney(Number(request.amount))}</p>
                <p className="text-xs text-muted-foreground">
                  {request.last_checked_at ? `Vérifié ${formatDateTime(request.last_checked_at)}` : `Créée ${formatDateTime(request.created_at)}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {status && <StatusBadge label={status.label} tone={status.tone} />}
                {request.environment === 'sandbox' && <StatusBadge label="Mode test" tone="info" />}
              </div>
            </div>

            {request.status === 'paid' && (
              <div
                role="status"
                className={cn(
                  'flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm',
                  request.applied_payment_id ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning-foreground'
                )}
              >
                {request.applied_payment_id ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span>
                  {request.applied_payment_id
                    ? `Paiement reçu${providerMethodLabel(request.provider_method) ? ` par ${providerMethodLabel(request.provider_method)}` : ''} et enregistré sur la dette du client.`
                    : request.apply_error || 'Paiement reçu, imputation en cours.'}
                </span>
              </div>
            )}
            {(request.status === 'failed' || request.status === 'expired' || request.status === 'cancelled') && (
              <div role="status" className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {request.status === 'failed'
                    ? 'Le paiement a échoué. Vous pouvez créer une nouvelle demande.'
                    : request.status === 'expired'
                      ? 'Le lien a expiré sans paiement.'
                      : 'Demande annulée. Si le client paie quand même ce lien, le paiement sera détecté et enregistré.'}
                </span>
              </div>
            )}

            {isPending && request.payment_url && (
              <>
                <div className="flex flex-col items-center gap-2">
                  <PaymentQr value={request.payment_url} />
                  <p className="text-center text-xs text-muted-foreground">
                    Le client scanne ce code avec son téléphone, ou reçoit le lien par WhatsApp.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input readOnly value={request.payment_url} aria-label="Lien de paiement" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button type="button" variant="outline" size="icon" onClick={copyLink} aria-label="Copier le lien" title="Copier le lien">
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" asChild>
                    <a href={request.payment_url} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir la page de paiement" title="Ouvrir la page de paiement">
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </Button>
                </div>
                <Button type="button" variant="brand" className="w-full" asChild>
                  <a href={whatsappLink(request.customer_phone, message)} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    Envoyer par WhatsApp
                  </a>
                </Button>
                <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  En attente du paiement : le statut se met à jour automatiquement.
                </p>
              </>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {!request ? (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Annuler
              </Button>
              <Button type="submit" form="mm-request-form" variant="brand" disabled={submitting || !amount}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Smartphone className="h-4 w-4" aria-hidden="true" />}
                Créer le lien de paiement
              </Button>
            </>
          ) : (
            <>
              {isPending && (
                <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleCancel} disabled={cancelling}>
                  {cancelling && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Annuler la demande
                </Button>
              )}
              {(isPending || (request.status === 'paid' && !request.applied_payment_id) || request.status === 'cancelled' || request.status === 'expired') && (
                <Button type="button" variant="outline" onClick={handleVerify} disabled={verifying}>
                  {verifying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                  Vérifier maintenant
                </Button>
              )}
              <Button type="button" variant={isPending ? 'outline' : 'brand'} onClick={() => onOpenChange(false)}>
                Fermer
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
