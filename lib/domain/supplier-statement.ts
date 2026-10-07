import type { CashQueryFn } from '../cash-automation'
import { money } from './payments'
import {
  listPayables,
  summarizePayables,
  SUPPLIER_PAYMENT_METHOD_LABELS,
  type SupplierPaymentMethod,
} from './payables'

// ----- Relevé fournisseur -----

export type StatementEntryType = 'purchase' | 'return' | 'credit_note' | 'payment' | 'payment_cancelled'

export type StatementEntry = {
  date: string
  type: StatementEntryType
  reference: string
  label: string
  purchase_order_id: string | null
  debit: number
  credit: number
  balance: number
}

const TYPE_ORDER: Record<StatementEntryType, number> = {
  purchase: 0,
  return: 1,
  credit_note: 2,
  payment: 3,
  payment_cancelled: 4,
}

/**
 * Relevé chronologique d'un fournisseur.
 * Débit (ce que l'on doit) : marchandises reçues, annulation d'un règlement.
 * Crédit : règlements, retours sur bon de commande, avoirs fournisseurs
 * (retours fournisseur traités avec remboursement « avoir »).
 * Solde = Σ débits − Σ crédits ; négatif = avance chez le fournisseur.
 * `from` / `to` (AAAA-MM-JJ) : les écritures antérieures à `from` forment le
 * solde d'ouverture.
 */
export async function buildSupplierStatement(
  q: CashQueryFn,
  companyId: string,
  supplierId: string,
  range: { from?: string | null; to?: string | null } = {}
) {
  const payables = await listPayables(q, companyId, { supplierId })

  const entries: Omit<StatementEntry, 'balance'>[] = []
  for (const p of payables) {
    if (p.received_value > 0 && p.received_on) {
      entries.push({
        date: p.received_on,
        type: 'purchase',
        reference: p.order_number,
        label: `Réception ${p.order_number}`,
        purchase_order_id: p.purchase_order_id,
        debit: p.received_value,
        credit: 0,
      })
    }
  }

  const returns = await q`
    WITH prices AS (
      SELECT poi.purchase_order_id, poi.product_variant_id,
             SUM(poi.quantity_ordered * COALESCE(poi.unit_price, 0)) / NULLIF(SUM(poi.quantity_ordered), 0) AS unit_price
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.purchase_order_id
      WHERE po.company_id = ${companyId} AND po.supplier_id = ${supplierId} AND po.status <> 'cancelled'
      GROUP BY poi.purchase_order_id, poi.product_variant_id
    )
    SELECT po.id AS purchase_order_id, po.order_number, sm.created_at::date::text AS date,
           ROUND(SUM(-sm.quantity * COALESCE(pr.unit_price, 0)), 2)::float8 AS value
    FROM stock_movements sm
    JOIN purchase_orders po ON po.id = sm.reference_id
    LEFT JOIN prices pr ON pr.purchase_order_id = po.id AND pr.product_variant_id = sm.product_variant_id
    WHERE sm.company_id = ${companyId}
      AND sm.reference_type = 'purchase_order' AND sm.movement_type = 'return'
      AND po.company_id = ${companyId} AND po.supplier_id = ${supplierId} AND po.status <> 'cancelled'
    GROUP BY po.id, po.order_number, sm.created_at::date
  `
  for (const r of returns) {
    if (!(Number(r.value) > 0)) continue
    entries.push({
      date: r.date,
      type: 'return',
      reference: r.order_number,
      label: `Retour de marchandises (${r.order_number})`,
      purchase_order_id: r.purchase_order_id,
      debit: 0,
      credit: Number(r.value),
    })
  }

  const creditNotes = await q`
    SELECT r.id, r.return_number, COALESCE(r.processed_at, r.created_at)::date::text AS date,
           r.total_amount::float8 AS amount, r.purchase_order_id
    FROM returns r
    WHERE r.company_id = ${companyId} AND r.supplier_id = ${supplierId}
      AND r.return_type = 'supplier' AND r.status = 'processed' AND r.refund_method = 'credit_note'
      AND r.total_amount > 0
  `
  for (const c of creditNotes) {
    entries.push({
      date: c.date,
      type: 'credit_note',
      reference: c.return_number ?? '—',
      label: `Avoir fournisseur ${c.return_number ?? ''}`.trim(),
      purchase_order_id: c.purchase_order_id ?? null,
      debit: 0,
      credit: Number(c.amount),
    })
  }

  const payments = await q`
    SELECT sp.id, sp.payment_number, sp.amount::float8 AS amount, sp.payment_method, sp.status,
           sp.paid_at::text AS paid_at, sp.cancelled_at::date::text AS cancelled_on,
           sp.purchase_order_id, po.order_number
    FROM supplier_payments sp
    JOIN purchase_orders po ON po.id = sp.purchase_order_id
    WHERE sp.company_id = ${companyId} AND sp.supplier_id = ${supplierId} AND po.status <> 'cancelled'
  `
  for (const p of payments) {
    const method = SUPPLIER_PAYMENT_METHOD_LABELS[p.payment_method as SupplierPaymentMethod] ?? p.payment_method
    entries.push({
      date: p.paid_at,
      type: 'payment',
      reference: p.payment_number,
      label: `Règlement ${String(method).toLowerCase()} (${p.order_number})`,
      purchase_order_id: p.purchase_order_id,
      debit: 0,
      credit: Number(p.amount),
    })
    if (p.status === 'cancelled') {
      entries.push({
        date: p.cancelled_on ?? p.paid_at,
        type: 'payment_cancelled',
        reference: p.payment_number,
        label: `Annulation du règlement ${p.payment_number}`,
        purchase_order_id: p.purchase_order_id,
        debit: Number(p.amount),
        credit: 0,
      })
    }
  }

  entries.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    return TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.reference.localeCompare(b.reference)
  })

  const from = range.from ?? null
  const to = range.to ?? null
  let balance = 0
  let opening = 0
  let totalDebit = 0
  let totalCredit = 0
  const out: StatementEntry[] = []
  for (const e of entries) {
    balance = money(balance + e.debit - e.credit)
    if (from && e.date < from) {
      opening = balance
      continue
    }
    if (to && e.date > to) continue
    totalDebit += e.debit
    totalCredit += e.credit
    out.push({ ...e, balance })
  }

  const open = payables.filter((p) => p.remaining > 0)
  return {
    /** Solde dû à ce jour (toutes écritures confondues). */
    balance,
    openingBalance: from ? opening : 0,
    closingBalance: out.length > 0 ? out[out.length - 1].balance : from ? opening : 0,
    totals: { debit: money(totalDebit), credit: money(totalCredit) },
    entries: out,
    summary: summarizePayables(payables),
    overdue: open.filter((p) => p.payment_status === 'overdue'),
    upcoming: open.filter((p) => p.payment_status !== 'overdue'),
  }
}

// ----- Historique des prix d'achat -----

type PricePoint = {
  purchase_order_id: string
  order_number: string
  date: string
  quantity: number
  unit_price: number
  change_pct: number | null
}

/**
 * Historique des prix d'achat par variante pour un fournisseur : chaque ligne
 * de bon de commande (non annulé), du plus récent au plus ancien, avec la
 * variation (%) par rapport à l'achat précédent de la même variante.
 */
export async function supplierPriceHistory(q: CashQueryFn, companyId: string, supplierId: string) {
  const rows = await q`
    SELECT poi.product_variant_id, p.name AS product_name, pt.name AS packaging_name,
           po.id AS purchase_order_id, po.order_number, po.ordered_at::date::text AS date,
           poi.quantity_ordered::int AS quantity, COALESCE(poi.unit_price, 0)::float8 AS unit_price
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.purchase_order_id
    JOIN product_variants pv ON pv.id = poi.product_variant_id
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN packaging_types pt ON pt.id = pv.packaging_type_id
    WHERE po.company_id = ${companyId} AND po.supplier_id = ${supplierId} AND po.status <> 'cancelled'
    ORDER BY p.name, pt.name NULLS FIRST, poi.product_variant_id, po.ordered_at, po.id, poi.id
  `
  const byVariant = new Map<
    string,
    { product_variant_id: string; product_name: string; packaging_name: string | null; history: PricePoint[] }
  >()
  for (const r of rows) {
    let v = byVariant.get(r.product_variant_id)
    if (!v) {
      v = { product_variant_id: r.product_variant_id, product_name: r.product_name, packaging_name: r.packaging_name, history: [] }
      byVariant.set(r.product_variant_id, v)
    }
    const prev = v.history[v.history.length - 1]
    const price = Number(r.unit_price)
    v.history.push({
      purchase_order_id: r.purchase_order_id,
      order_number: r.order_number,
      date: r.date,
      quantity: Number(r.quantity),
      unit_price: price,
      change_pct: prev && prev.unit_price > 0 ? Math.round(((price - prev.unit_price) / prev.unit_price) * 1000) / 10 : null,
    })
  }

  return [...byVariant.values()].map((v) => {
    const prices = v.history.map((h) => h.unit_price)
    const qty = v.history.reduce((s, h) => s + h.quantity, 0)
    const weighted = v.history.reduce((s, h) => s + h.quantity * h.unit_price, 0)
    const last = v.history[v.history.length - 1]
    return {
      product_variant_id: v.product_variant_id,
      product_name: v.product_name,
      packaging_name: v.packaging_name,
      last_price: last.unit_price,
      last_date: last.date,
      last_change_pct: last.change_pct,
      min_price: Math.min(...prices),
      max_price: Math.max(...prices),
      avg_price: qty > 0 ? money(weighted / qty) : last.unit_price,
      purchases: v.history.length,
      history: [...v.history].reverse(),
    }
  })
}
