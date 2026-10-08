import type { TicketInput } from './ticket-printer'
import { summarizeVat } from '@/lib/vat'

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Espèces',
  mobile_money: 'Mobile Money',
  credit: 'Crédit',
  mixed: 'Mixte',
  bank_transfer: 'Virement',
  check: 'Chèque',
}

/** Champs utilisés d'une vente (réponse de GET /api/sales/[id]). */
export type SaleForTicket = {
  order_number: string
  created_at: string
  client_name: string | null
  created_by_name: string | null
  depot_name?: string | null
  total_amount: number | string
  paid_amount: number | string
  payment_method: string | null
  items: { product_name: string; packaging_name: string | null; quantity: number | string; unit_price: number | string; total_price?: number | string | null; vat_rate?: number | string | null; amount_ht?: number | string | null; vat_amount?: number | string | null }[]
  packagingItems: { packaging_name: string; quantity_out: number | string; quantity_in: number | string; unit_price: number | string }[]
}

function label(product: string, packaging: string | null) {
  if (!packaging || packaging.startsWith('Emballage - ')) return product
  return `${product} ${packaging}`
}

/** Vente du dashboard → ticket thermique (payé, reste dû, consignes). */
export function saleToTicket(sale: SaleForTicket): TicketInput {
  const total = Number(sale.total_amount) || 0
  const paid = Number(sale.paid_amount) || 0
  // TVA figée sur les lignes de la vente (entreprise assujettie au moment de la vente)
  const vatLines = sale.items.filter((i) => i.vat_amount != null)
  const summary = vatLines.length
    ? summarizeVat(vatLines.map((i) => ({ rate: Number(i.vat_rate), ht: Number(i.amount_ht), vat: Number(i.vat_amount), ttc: Number(i.total_price ?? 0) })))
    : null
  return {
    title: 'Vente',
    number: sale.order_number,
    date: sale.created_at,
    meta: [
      { label: 'Client', value: sale.client_name || 'Client passager' },
      { label: 'Vendeur', value: sale.created_by_name || '' },
    ],
    lines: sale.items.map((i) => ({
      name: label(i.product_name, i.packaging_name),
      quantity: Number(i.quantity) || 0,
      unitPrice: Number(i.unit_price) || 0,
      total: i.total_price != null ? Number(i.total_price) : undefined,
    })),
    deposits: sale.packagingItems.map((p) => ({
      name: p.packaging_name,
      quantityOut: Number(p.quantity_out) || 0,
      quantityIn: Number(p.quantity_in) || 0,
      unitPrice: Number(p.unit_price) || 0,
    })),
    total,
    paid,
    paymentLabel: sale.payment_method ? PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method : null,
    change: 0,
    due: Math.max(0, total - paid),
    vat: summary
      ? { byRate: summary.byRate.map((r) => ({ rate: r.rate, base: r.base, vat: r.vat })), totalHt: summary.totalHt, totalVat: summary.totalVat }
      : null,
  }
}
