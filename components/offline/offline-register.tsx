'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { WifiOff } from 'lucide-react'
import { PosOrderView } from '@/components/pos/order-view'
import { PaymentDialog, type PaymentMethod } from '@/components/pos/payment-dialog'
import { PaidDialog, RenameDialog } from '@/components/pos/dialogs'
import { variantLabel, type PaidTicket, type PosCatalogItem, type PosOrder, type PosOrderItem } from '@/components/pos/types'
import { useTicketPrinter } from '@/components/print/ticket-printer'
import { posTicketToTicket } from '@/components/print/pos-ticket'
import { localAvailable, newRequestId, pendingQuantities, round, type OfflineSale } from '@/lib/offline/queue'
import type { PosSnapshot } from '@/lib/offline/store'
import type { OfflineSalesState } from './use-offline-sales'

const OFFLINE_METHODS: PaymentMethod[] = ['cash', 'mobile_money']

function emptyOrder(label: string | null): PosOrder {
  return {
    id: 'offline',
    ticket_number: 'Hors ligne',
    table_id: null,
    table_name: null,
    order_type: 'counter',
    label,
    covers: null,
    client_id: null,
    client_name: null,
    client_credit_limit: null,
    status: 'open',
    opened_at: new Date().toISOString(),
    opened_by_name: null,
    items: [],
    total: 0,
  }
}

function withTotal(order: PosOrder): PosOrder {
  return { ...order, total: round(order.items.filter((i) => i.status === 'active').reduce((s, i) => s + i.quantity * i.unit_price, 0)) }
}

/**
 * Caisse hors ligne : vente comptoir au comptant à partir du catalogue mis en
 * cache, ou encaissement d'un ticket ouvert déjà chargé (sans le modifier).
 * Chaque vente est mise en file avec sa clé d'idempotence ; le stock affiché
 * est décrémenté localement (ventes en attente + panier).
 */
export function OfflineRegister({
  owner,
  snapshot,
  sales,
  cashierName,
  ticket,
  onLeaveTicket,
  onPaid,
}: {
  owner: string
  snapshot: PosSnapshot
  sales: Pick<OfflineSalesState, 'queue' | 'enqueue'>
  cashierName: string
  /** Ticket ouvert (table) chargé avant la coupure : encaissable tel quel. */
  ticket?: PosOrder | null
  onLeaveTicket?: () => void
  /** Ticket encaissé : affiché par l'écran parent (sinon par cette caisse). */
  onPaid?: (ticket: PaidTicket) => void
}) {
  const [cart, setCart] = useState<PosOrder>(() => emptyOrder(null))
  const [dialog, setDialog] = useState<'none' | 'pay' | 'rename'>('none')
  const [submitting, setSubmitting] = useState(false)
  const [paid, setPaid] = useState<PaidTicket | null>(null)
  const printer = useTicketPrinter()

  const order = ticket ?? cart
  const pending = useMemo(() => pendingQuantities(sales.queue, owner, snapshot.depotId), [sales.queue, owner, snapshot.depotId])

  const catalog: PosCatalogItem[] = useMemo(() => {
    const inCart = new Map<string, number>()
    if (!ticket) for (const i of cart.items) inCart.set(i.product_variant_id, (inCart.get(i.product_variant_id) ?? 0) + i.quantity)
    return snapshot.catalog.map((c) => ({
      ...c,
      // Le stock d'un ticket ouvert est déjà réservé côté serveur (inclus dans `available`)
      available: localAvailable(c.available, pending.get(c.variant_id) ?? 0, inCart.get(c.variant_id) ?? 0),
      // Pas d'ouverture de casier hors ligne (mouvement de stock serveur)
      openable: 0,
    }))
  }, [snapshot.catalog, pending, cart.items, ticket])

  function add(variantId: string, quantity: number) {
    if (ticket) {
      toast.info('Hors ligne : un ticket ouvert ne peut pas être modifié', {
        description: 'Encaissez-le tel quel ou revenez à la caisse hors ligne pour une nouvelle vente.',
      })
      return
    }
    const item = catalog.find((c) => c.variant_id === variantId)
    if (!item) return
    if (item.available < quantity) {
      toast.error(item.available > 0 ? `${variantLabel(item)} : plus que ${item.available} disponible(s)` : `${variantLabel(item)} : rupture (stock connu)`, {
        description: 'Hors ligne, l’ouverture de casier n’est pas possible.',
      })
      return
    }
    setCart((prev) => {
      const existing = prev.items.find((i) => i.product_variant_id === variantId)
      const items: PosOrderItem[] = existing
        ? prev.items.map((i) => (i === existing ? { ...i, quantity: i.quantity + quantity } : i))
        : [
            ...prev.items,
            {
              id: newRequestId(),
              product_variant_id: variantId,
              quantity,
              unit_price: item.price,
              status: 'active',
              void_reason: null,
              created_at: new Date().toISOString(),
              added_by: null,
              product_name: item.product_name,
              packaging_name: item.packaging_name,
              added_by_name: null,
            },
          ]
      return withTotal({ ...prev, items })
    })
  }

  function reduce(item: PosOrderItem, newQuantity: number) {
    if (ticket) {
      toast.info('Hors ligne : un ticket ouvert ne peut pas être modifié')
      return
    }
    setCart((prev) =>
      withTotal({
        ...prev,
        items: newQuantity <= 0 ? prev.items.filter((i) => i.id !== item.id) : prev.items.map((i) => (i.id === item.id ? { ...i, quantity: newQuantity } : i)),
      })
    )
  }

  async function pay(input: { paymentMethod: PaymentMethod; paidAmount: number; received: number }) {
    if (input.paymentMethod !== 'cash' && input.paymentMethod !== 'mobile_money') return
    const active = order.items.filter((i) => i.status === 'active')
    if (active.length === 0) return
    if (ticket && sales.queue.some((s) => s.status === 'pending' && s.kind === 'pos' && 'posOrderId' in s.payload && s.payload.posOrderId === ticket.id)) {
      toast.error(`Le ticket ${ticket.ticket_number} est déjà encaissé hors ligne`, { description: 'Il sera clos à l’envoi de la vente.' })
      setDialog('none')
      return
    }
    setSubmitting(true)
    try {
      const id = newRequestId()
      const now = new Date().toISOString()
      const label = ticket ? (ticket.table_name ?? ticket.label ?? `Ticket ${ticket.ticket_number}`) : order.label || 'Comptoir'
      const lines = active.map((i) => ({ variantId: i.product_variant_id, name: variantLabel(i), quantity: i.quantity, unitPrice: i.unit_price }))
      const sale: OfflineSale = {
        id,
        owner,
        kind: 'pos',
        createdAt: now,
        status: 'pending',
        attempts: 0,
        summary: {
          label: ticket ? `${label} · ${ticket.ticket_number}` : `${label} (point de vente)`,
          depotId: snapshot.depotId,
          depotName: snapshot.depots.find((d) => d.id === snapshot.depotId)?.name ?? null,
          paymentMethod: input.paymentMethod,
          total: order.total,
          lines,
        },
        payload: {
          clientRequestId: id,
          depotId: snapshot.depotId,
          posOrderId: ticket?.id ?? null,
          label: ticket ? null : order.label,
          paymentMethod: input.paymentMethod,
          soldAt: now,
          items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
        },
      }
      await sales.enqueue(sale)
      const paidTicket: PaidTicket = {
        ticketNumber: ticket?.ticket_number ?? `HL-${id.slice(0, 8).toUpperCase()}`,
        orderNumber: 'En attente d’envoi',
        tableName: ticket?.table_name ?? null,
        label: ticket ? ticket.label : order.label,
        items: lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice })),
        total: order.total,
        paymentMethod: input.paymentMethod,
        received: input.received,
        change: input.paymentMethod === 'cash' ? Math.max(0, input.received - order.total) : 0,
        paidAt: now,
        cashierName,
      }
      if (onPaid) onPaid(paidTicket)
      else setPaid(paidTicket)
      setDialog('none')
      if (!ticket) setCart(emptyOrder(null))
    } catch (e) {
      toast.error('Vente non enregistrée sur l’appareil', { description: e instanceof Error ? e.message : undefined })
    } finally {
      setSubmitting(false)
    }
  }

  function finishPaid() {
    setPaid(null)
    if (ticket) onLeaveTicket?.()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!ticket && (
        <p className="flex items-center gap-2 border-b border-border bg-card px-4 py-2 text-xs text-muted-foreground">
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Caisse hors ligne · ventes au comptant (espèces, Mobile Money) · stock connu au{' '}
          {new Date(snapshot.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
        </p>
      )}
      <div className="min-h-0 flex-1">
        <PosOrderView
          order={order}
          catalog={catalog}
          pendingVariantId={null}
          onBack={() => {
            if (ticket) onLeaveTicket?.()
            else if (cart.items.length > 0) toast.info('Hors ligne : la mise en attente n’est pas possible. Encaissez ou videz le ticket.')
          }}
          onAdd={add}
          onReduce={reduce}
          onCheckout={() => setDialog('pay')}
          onTransfer={() => setDialog('rename')}
          onRename={() => setDialog('rename')}
          onAttachClient={() => toast.info('Hors ligne : l’ardoise (client) n’est pas disponible', { description: 'Elle exige la vérification du plafond par le serveur.' })}
          onCancelOrder={() => {
            if (ticket) {
              toast.info('Hors ligne : l’annulation d’un ticket ouvert n’est pas possible')
              return
            }
            setCart(emptyOrder(null))
          }}
        />
      </div>

      <PaymentDialog
        open={dialog === 'pay'}
        total={order.total}
        hasClient={false}
        clientName={null}
        submitting={submitting}
        allowedMethods={OFFLINE_METHODS}
        onOpenChange={(o) => !o && setDialog('none')}
        onConfirm={(input) => void pay(input)}
      />
      <RenameDialog
        open={dialog === 'rename' && !ticket}
        initial={cart.label ?? ''}
        submitting={false}
        onOpenChange={(o) => !o && setDialog('none')}
        onSave={(label) => {
          setCart((prev) => ({ ...prev, label: label || null }))
          setDialog('none')
        }}
      />
      <PaidDialog ticket={paid} onPrint={() => paid && printer.printBrowser(posTicketToTicket(paid))} onClose={finishPaid} />
      {printer.portal}
    </div>
  )
}
