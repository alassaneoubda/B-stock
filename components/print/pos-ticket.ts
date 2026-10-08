import type { PaidTicket } from '@/components/pos/types'
import type { TicketInput } from './ticket-printer'

const METHOD_LABELS: Record<PaidTicket['paymentMethod'], string> = {
  cash: 'Espèces',
  mobile_money: 'Mobile Money',
  credit: 'Ardoise',
  mixed: 'Mixte',
}

/** Ticket encaissé au point de vente → ticket thermique. */
export function posTicketToTicket(t: PaidTicket): TicketInput {
  const paid = t.paymentMethod === 'credit' ? 0 : t.received
  return {
    title: 'Ticket',
    number: t.ticketNumber,
    date: t.paidAt,
    meta: [
      { label: 'Table', value: [t.tableName, t.label].filter(Boolean).join(' — ') },
      { label: 'Servi par', value: t.cashierName },
      { label: 'Vente', value: t.orderNumber },
    ],
    lines: t.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
    total: t.total,
    paid,
    paymentLabel: METHOD_LABELS[t.paymentMethod],
    change: t.change,
    due: Math.max(0, t.total - Math.min(paid, t.total)),
  }
}
