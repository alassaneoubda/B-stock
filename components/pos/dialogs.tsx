'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Printer, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch, toastError } from '@/lib/api-client'
import { formatMoney, formatSignedMoney } from '@/lib/format'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'
import type { PaidTicket, PosOpenOrder, PosTable } from './types'

/** Saisie d'un motif (retrait d'article, annulation de ticket). */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive,
  submitting,
  requireReason = true,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  submitting: boolean
  requireReason?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (open) setReason('')
  }, [open])
  const suggestions = ['Erreur de saisie', 'Bouteille cassée', 'Client parti', 'Offert par la maison']

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {requireReason && (
          <div className="space-y-3">
            <Label htmlFor="reason">Motif</Label>
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus maxLength={300} />
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setReason(s)}
                  className="h-8 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Retour
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => onConfirm(reason.trim())}
            disabled={submitting || (requireReason && !reason.trim())}
          >
            {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Création rapide des tables (gérant). */
export function TablesSetupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [count, setCount] = useState('10')
  const [prefix, setPrefix] = useState('T')
  const [area, setArea] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    try {
      await apiFetch('/api/pos/tables', {
        method: 'POST',
        body: { count: Number(count), prefix: prefix.trim() || 'T', area: area.trim() || null },
      })
      onCreated()
      onOpenChange(false)
    } catch (e) {
      toastError(e)
    } finally {
      setSubmitting(false)
    }
  }

  const n = Number(count)
  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Créer les tables</DialogTitle>
          <DialogDescription>Vous pourrez les renommer ou en ajouter d’autres ensuite.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="count">Nombre de tables</Label>
            <Input id="count" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prefix">Préfixe</Label>
            <Input id="prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={20} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="area">Zone (facultatif)</Label>
            <Input id="area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Terrasse, Salle, VIP…" maxLength={50} />
          </div>
        </div>
        {n > 0 && n <= 100 && (
          <p className="text-sm text-muted-foreground">
            Seront créées : <strong className="text-foreground">{prefix || 'T'}1</strong> à{' '}
            <strong className="text-foreground">
              {prefix || 'T'}
              {n}
            </strong>
          </p>
        )}
        <DialogFooter>
          <Button onClick={submit} disabled={submitting || !(n > 0 && n <= 100)}>
            {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            Créer {n > 0 ? n : ''} table{n > 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Choix d'une table libre (transfert). */
export function TablePickerDialog({
  open,
  tables,
  openOrders,
  currentTableId,
  submitting,
  onOpenChange,
  onPick,
}: {
  open: boolean
  tables: PosTable[]
  openOrders: PosOpenOrder[]
  currentTableId: string | null
  submitting: boolean
  onOpenChange: (open: boolean) => void
  onPick: (tableId: string | null) => void
}) {
  const busy = new Set(openOrders.map((o) => o.table_id).filter(Boolean))
  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Changer de table</DialogTitle>
          <DialogDescription>Seules les tables libres sont proposées.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {tables.map((t) => {
            const disabled = (busy.has(t.id) && t.id !== currentTableId) || t.id === currentTableId
            return (
              <button
                key={t.id}
                disabled={disabled || submitting}
                onClick={() => onPick(t.id)}
                className={cn(
                  'h-14 rounded-xl border text-sm font-semibold transition-colors',
                  t.id === currentTableId
                    ? 'border-brand bg-brand-soft text-brand-strong'
                    : disabled
                      ? 'cursor-not-allowed border-border bg-muted text-muted-foreground'
                      : 'border-border bg-card hover:border-foreground/40'
                )}
              >
                {t.name}
              </button>
            )
          })}
        </div>
        {currentTableId && (
          <Button variant="outline" onClick={() => onPick(null)} disabled={submitting}>
            Passer en vente comptoir (sans table)
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Nom libre du ticket (« Kouamé », « Groupe terrasse »). */
export function RenameDialog({
  open,
  initial,
  submitting,
  onOpenChange,
  onSave,
}: {
  open: boolean
  initial: string
  submitting: boolean
  onOpenChange: (open: boolean) => void
  onSave: (label: string) => void
}) {
  const [label, setLabel] = useState(initial)
  useEffect(() => {
    if (open) setLabel(initial)
  }, [open, initial])
  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nommer le ticket</DialogTitle>
          <DialogDescription>Pour retrouver facilement la commande.</DialogDescription>
        </DialogHeader>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={100} autoFocus placeholder="Ex. Kouamé" />
        <DialogFooter>
          <Button onClick={() => onSave(label.trim())} disabled={submitting}>
            {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type ClientHit = { id: string; name: string; phone: string | null; product_balance: string | number | null }

/** Rattacher un client identifié (nécessaire pour l'ardoise). */
export function ClientPickerDialog({
  open,
  submitting,
  onOpenChange,
  onPick,
}: {
  open: boolean
  submitting: boolean
  onOpenChange: (open: boolean) => void
  onPick: (clientId: string | null) => void
}) {
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [clients, setClients] = useState<ClientHit[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    apiFetch<{ data: ClientHit[] }>(`/api/clients?limit=20&search=${encodeURIComponent(debounced)}`, {
      signal: controller.signal,
    })
      .then((res) => setClients(res.data))
      .catch((e) => toastError(e))
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [open, debounced])

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rattacher un client</DialogTitle>
          <DialogDescription>Permet de mettre le ticket sur son ardoise.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom ou téléphone" className="pl-9" autoFocus />
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {loading && clients.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Recherche…</p>
          ) : clients.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Aucun client trouvé.</p>
          ) : (
            clients.map((c) => {
              const balance = Number(c.product_balance ?? 0)
              return (
                <button
                  key={c.id}
                  disabled={submitting}
                  onClick={() => onPick(c.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                    {c.phone && <span className="block text-xs text-muted-foreground">{c.phone}</span>}
                  </span>
                  {balance < 0 && (
                    <span className="tabular shrink-0 text-xs font-medium text-destructive">Doit {formatMoney(-balance)}</span>
                  )}
                  {balance > 0 && <span className="tabular shrink-0 text-xs text-success">{formatSignedMoney(balance)}</span>}
                </button>
              )
            })
          )}
        </div>
        <Button variant="outline" onClick={() => onPick(null)} disabled={submitting}>
          Retirer le client du ticket
        </Button>
      </DialogContent>
    </Dialog>
  )
}

/** Confirmation après encaissement : monnaie à rendre en grand, impression du ticket. */
export function PaidDialog({
  ticket,
  onPrint,
  onClose,
}: {
  ticket: PaidTicket | null
  onPrint: () => void
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(ticket)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="text-center sm:max-w-sm">
        <DialogHeader className="items-center">
          <span className="pos-success-pop mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
          </span>
          <DialogTitle>Ticket encaissé</DialogTitle>
          <DialogDescription>
            {ticket?.ticketNumber} · {ticket ? formatMoney(ticket.total) : ''}
          </DialogDescription>
        </DialogHeader>
        {ticket && ticket.change > 0 && (
          <div className="rounded-xl bg-success-soft px-4 py-4">
            <p className="text-sm text-foreground">Monnaie à rendre</p>
            <p className="tabular text-4xl font-semibold text-success">{formatMoney(ticket.change)}</p>
          </div>
        )}
        {ticket?.paymentMethod === 'credit' && (
          <p className="text-sm text-muted-foreground">Le montant a été ajouté à l’ardoise du client.</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" onClick={onPrint}>
            <Printer aria-hidden="true" /> Imprimer
          </Button>
          <Button size="lg" onClick={onClose} autoFocus>
            Terminer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
