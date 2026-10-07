'use client'

import { formatDateTime, formatMoney } from '@/lib/format'
import type { PaidTicket } from './types'

const METHOD_LABELS: Record<PaidTicket['paymentMethod'], string> = {
  cash: 'Espèces',
  mobile_money: 'Mobile Money',
  credit: 'Ardoise',
  mixed: 'Mixte',
}

/**
 * Ticket de caisse imprimable (imprimantes thermiques 58/80 mm).
 * Invisible à l'écran ; seul élément imprimé pendant window.print()
 * grâce aux règles @media print de globals.css (.pos-receipt).
 */
export function Receipt({ ticket, companyName }: { ticket: PaidTicket | null; companyName: string }) {
  if (!ticket) return null
  return (
    <div className="pos-receipt" aria-hidden="true">
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{companyName}</div>
        <div>Ticket {ticket.ticketNumber}</div>
        <div>{formatDateTime(ticket.paidAt)}</div>
        {(ticket.tableName || ticket.label) && <div>{[ticket.tableName, ticket.label].filter(Boolean).join(' — ')}</div>}
      </div>
      <hr />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {ticket.items.map((item, i) => (
            <tr key={i}>
              <td style={{ padding: '2px 0' }}>
                {item.quantity} × {item.name}
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatMoney(item.quantity * item.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
        <span>TOTAL</span>
        <span>{formatMoney(ticket.total)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{METHOD_LABELS[ticket.paymentMethod]}</span>
        <span>{formatMoney(ticket.received)}</span>
      </div>
      {ticket.change > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Monnaie rendue</span>
          <span>{formatMoney(ticket.change)}</span>
        </div>
      )}
      <hr />
      <div style={{ textAlign: 'center' }}>
        <div>Servi par {ticket.cashierName}</div>
        <div>Vente {ticket.orderNumber}</div>
        <div style={{ marginTop: 6 }}>Merci de votre visite !</div>
      </div>
    </div>
  )
}
