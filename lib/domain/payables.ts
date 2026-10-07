import type { Tx } from '../db'
import { AppError, notFound } from '../errors'
import { recordCashMovement, type CashQueryFn } from '../cash-automation'
import { nextDocumentNumber } from '../sequences'
import { money } from './payments'
import { assertPeriodOpen } from '../accounting/period-lock'

/**
 * Dettes fournisseurs (comptes à payer).
 *
 * Dette d'un bon de commande (non annulé) :
 *   montant dû = Σ quantité reçue × prix d'achat de la ligne
 *              − valeur des retours fournisseurs de ce bon
 *                (stock_movements 'return' référencés 'purchase_order',
 *                 valorisés au prix moyen de la variante sur le bon)
 *   payé       = purchase_orders.paid_amount (règlements non annulés)
 *   reste      = max(montant dû − payé, 0)
 *   échéance   = payment_due_date si saisie, sinon date de première réception
 *                (+ conditions de paiement du fournisseur, en jours)
 *
 * Statut : 'paid' (reste nul), 'overdue' (reste > 0 et échéance dépassée),
 * 'partial' (déjà payé en partie), 'unpaid'.
 *
 * Le calcul ne lit que les tables (lignes reçues, mouvements de stock) : il
 * est indépendant de la logique de réception elle-même.
 */

export const SUPPLIER_PAYMENT_METHODS = ['cash', 'bank_transfer', 'mobile_money', 'check'] as const
export type SupplierPaymentMethod = (typeof SUPPLIER_PAYMENT_METHODS)[number]

export const SUPPLIER_PAYMENT_METHOD_LABELS: Record<SupplierPaymentMethod, string> = {
  cash: 'Espèces',
  bank_transfer: 'Virement',
  mobile_money: 'Mobile Money',
  check: 'Chèque',
}

export type PayableStatus = 'unpaid' | 'partial' | 'paid' | 'overdue'

export type PayableRow = {
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
  /** Reste dû avec une échéance dans les 7 prochains jours (aujourd'hui inclus). */
  due_soon: boolean
  payment_status: PayableStatus
}

export type PayableFilters = {
  supplierId?: string | null
  purchaseOrderId?: string | null
}

const formatFcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`

/**
 * Dettes par bon de commande : uniquement les bons ayant une dette ou un
 * règlement (bons reçus en tout ou partie). Tri : échéance la plus ancienne.
 */
export async function listPayables(
  q: CashQueryFn,
  companyId: string,
  filters: PayableFilters = {}
): Promise<PayableRow[]> {
  const supplierId = filters.supplierId ?? null
  const purchaseOrderId = filters.purchaseOrderId ?? null
  const rows = await q`
    WITH po AS (
      SELECT po.id, po.order_number, po.status, po.supplier_id, s.name AS supplier_name,
             d.name AS depot_name, po.ordered_at, po.received_at, po.payment_due_date,
             COALESCE(po.paid_amount, 0) AS paid_amount,
             COALESCE(s.payment_terms_days, 0) AS terms
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      LEFT JOIN depots d ON d.id = po.depot_id
      WHERE po.company_id = ${companyId}
        AND po.status <> 'cancelled'
        AND (${supplierId}::uuid IS NULL OR po.supplier_id = ${supplierId}::uuid)
        AND (${purchaseOrderId}::uuid IS NULL OR po.id = ${purchaseOrderId}::uuid)
    ),
    lines AS (
      SELECT poi.purchase_order_id,
             SUM(poi.quantity_ordered * COALESCE(poi.unit_price, 0)) AS ordered_value,
             SUM(COALESCE(poi.quantity_received, 0) * COALESCE(poi.unit_price, 0)) AS received_value
      FROM purchase_order_items poi
      JOIN po ON po.id = poi.purchase_order_id
      GROUP BY poi.purchase_order_id
    ),
    prices AS (
      SELECT poi.purchase_order_id, poi.product_variant_id,
             SUM(poi.quantity_ordered * COALESCE(poi.unit_price, 0)) / NULLIF(SUM(poi.quantity_ordered), 0) AS unit_price
      FROM purchase_order_items poi
      JOIN po ON po.id = poi.purchase_order_id
      GROUP BY poi.purchase_order_id, poi.product_variant_id
    ),
    returned AS (
      SELECT sm.reference_id AS purchase_order_id,
             SUM(-sm.quantity * COALESCE(pr.unit_price, 0)) AS returned_value
      FROM stock_movements sm
      JOIN po ON po.id = sm.reference_id
      LEFT JOIN prices pr ON pr.purchase_order_id = sm.reference_id AND pr.product_variant_id = sm.product_variant_id
      WHERE sm.company_id = ${companyId}
        AND sm.reference_type = 'purchase_order'
        AND sm.movement_type = 'return'
      GROUP BY sm.reference_id
    ),
    first_reception AS (
      SELECT sm.reference_id AS purchase_order_id, MIN(sm.created_at) AS first_at
      FROM stock_movements sm
      JOIN po ON po.id = sm.reference_id
      WHERE sm.company_id = ${companyId}
        AND sm.reference_type = 'purchase_order'
        AND sm.movement_type = 'purchase'
      GROUP BY sm.reference_id
    ),
    computed AS (
      SELECT po.*,
             ROUND(COALESCE(l.ordered_value, 0), 2) AS ordered_value,
             ROUND(COALESCE(l.received_value, 0), 2) AS received_value,
             ROUND(COALESCE(r.returned_value, 0), 2) AS returned_value,
             GREATEST(ROUND(COALESCE(l.received_value, 0) - COALESCE(r.returned_value, 0), 2), 0) AS amount_due,
             COALESCE(fr.first_at, po.received_at)::date AS received_on
      FROM po
      LEFT JOIN lines l ON l.purchase_order_id = po.id
      LEFT JOIN returned r ON r.purchase_order_id = po.id
      LEFT JOIN first_reception fr ON fr.purchase_order_id = po.id
    ),
    dated AS (
      SELECT c.*,
             GREATEST(c.amount_due - c.paid_amount, 0) AS remaining,
             COALESCE(c.payment_due_date, c.received_on + c.terms) AS due_date
      FROM computed c
      WHERE c.amount_due > 0 OR c.paid_amount > 0
    )
    SELECT id AS purchase_order_id, order_number, status AS order_status, supplier_id, supplier_name,
           depot_name, ordered_at, received_on::text AS received_on,
           ordered_value::float8 AS ordered_value,
           received_value::float8 AS received_value,
           returned_value::float8 AS returned_value,
           amount_due::float8 AS amount_due,
           paid_amount::float8 AS paid_amount,
           remaining::float8 AS remaining,
           due_date::text AS due_date,
           (payment_due_date IS NOT NULL) AS due_date_overridden,
           CASE WHEN remaining > 0 AND due_date < CURRENT_DATE THEN (CURRENT_DATE - due_date) ELSE 0 END::int AS days_overdue,
           COALESCE(remaining > 0 AND due_date >= CURRENT_DATE AND due_date <= CURRENT_DATE + 7, false) AS due_soon,
           CASE
             WHEN remaining <= 0 THEN 'paid'
             WHEN due_date < CURRENT_DATE THEN 'overdue'
             WHEN paid_amount > 0 THEN 'partial'
             ELSE 'unpaid'
           END AS payment_status
    FROM dated
    ORDER BY (remaining <= 0), due_date NULLS LAST, ordered_at, id
  `
  return rows as PayableRow[]
}

export type PayablesSummary = {
  totalDue: number
  overdue: number
  dueSoon: number
  openCount: number
  overdueCount: number
  dueSoonCount: number
}

export function summarizePayables(rows: PayableRow[]): PayablesSummary {
  const open = rows.filter((r) => r.remaining > 0)
  const overdue = open.filter((r) => r.payment_status === 'overdue')
  const soon = open.filter((r) => r.due_soon)
  const sum = (list: PayableRow[]) => money(list.reduce((s, r) => s + r.remaining, 0))
  return {
    totalDue: sum(open),
    overdue: sum(overdue),
    dueSoon: sum(soon),
    openCount: open.length,
    overdueCount: overdue.length,
    dueSoonCount: soon.length,
  }
}

// ----- Règlements -----

export type SupplierPaymentRow = {
  id: string
  company_id: string
  supplier_id: string | null
  purchase_order_id: string
  payment_number: string
  amount: string
  payment_method: SupplierPaymentMethod
  reference: string | null
  notes: string | null
  paid_at: Date
  status: 'completed' | 'cancelled'
  cash_movement_id: string | null
  created_at: Date
}

export type RecordSupplierPaymentInput = {
  companyId: string
  purchaseOrderId: string
  userId: string
  amount: number
  method: SupplierPaymentMethod
  reference?: string | null
  notes?: string | null
  paidAt?: string | null
}

/**
 * Enregistre un règlement (partiel ou total) d'un bon de commande.
 * À appeler dans un `withTransaction`. Espèces + caisse ouverte : sortie de
 * caisse automatique (catégorie 'supplier_payment'), sinon avertissement.
 */
export async function recordSupplierPayment(tx: Tx, input: RecordSupplierPaymentInput) {
  const amount = money(input.amount)
  if (!(amount > 0)) throw new AppError(400, 'Le montant doit être positif', 'BAD_REQUEST')
  if (input.paidAt) {
    const [{ future }] = await tx.sql<{ future: boolean }>`SELECT ${input.paidAt}::date > CURRENT_DATE AS future`
    if (future) throw new AppError(400, 'La date du règlement ne peut pas être dans le futur', 'BAD_REQUEST')
  }
  // Règlement daté d'un mois clôturé (export comptable déjà transmis) : refusé
  await assertPeriodOpen(tx.sql, input.companyId, input.paidAt ?? null)

  // Verrou du bon : deux règlements simultanés sont sérialisés.
  const [po] = await tx.sql<{ id: string; status: string; order_number: string; supplier_id: string | null; supplier_name: string | null }>`
    SELECT po.id, po.status, po.order_number, po.supplier_id, s.name AS supplier_name
    FROM purchase_orders po
    LEFT JOIN suppliers s ON s.id = po.supplier_id
    WHERE po.id = ${input.purchaseOrderId} AND po.company_id = ${input.companyId}
    FOR UPDATE OF po
  `
  if (!po) throw notFound('Commande')
  if (po.status === 'cancelled') {
    throw new AppError(409, 'Cette commande est annulée : aucun règlement possible', 'INVALID_STATUS')
  }

  const [payable] = await listPayables(tx.sql, input.companyId, { purchaseOrderId: po.id })
  const remaining = payable ? money(payable.remaining) : 0
  if (remaining <= 0) {
    throw new AppError(
      409,
      payable && payable.amount_due > 0
        ? 'Cette commande est déjà entièrement réglée'
        : "Rien à payer : aucune marchandise n'a encore été réceptionnée sur cette commande",
      'NOTHING_TO_PAY'
    )
  }
  if (amount > remaining) {
    throw new AppError(409, `Montant supérieur au reste à payer (${formatFcfa(remaining)})`, 'OVERPAYMENT', {
      remaining,
    })
  }

  const paymentNumber = await nextDocumentNumber(tx, input.companyId, 'supplier_payment')
  const [payment] = await tx.sql<SupplierPaymentRow>`
    INSERT INTO supplier_payments (
      company_id, supplier_id, purchase_order_id, payment_number, amount,
      payment_method, reference, notes, paid_at, created_by
    ) VALUES (
      ${input.companyId}, ${po.supplier_id}, ${po.id}, ${paymentNumber}, ${amount},
      ${input.method}, ${input.reference ?? null}, ${input.notes ?? null},
      COALESCE(${input.paidAt ?? null}::date, CURRENT_DATE), ${input.userId}
    )
    RETURNING *
  `
  await tx.sql`
    UPDATE purchase_orders SET paid_amount = COALESCE(paid_amount, 0) + ${amount}, updated_at = NOW()
    WHERE id = ${po.id}
  `

  const warnings: string[] = []
  let cashMovementId: string | null = null
  if (input.method === 'cash') {
    const movement = await recordCashMovement(tx.sql, {
      companyId: input.companyId,
      movementType: 'cash_out',
      category: 'supplier_payment',
      amount,
      description: `Paiement fournisseur ${paymentNumber} — ${po.supplier_name ?? 'Fournisseur'} (${po.order_number})`,
      referenceType: 'supplier_payment',
      referenceId: payment.id,
      userId: input.userId,
    })
    if (movement) {
      cashMovementId = movement.id
      await tx.sql`UPDATE supplier_payments SET cash_movement_id = ${movement.id} WHERE id = ${payment.id}`
    } else {
      warnings.push(
        `Aucune caisse ouverte : la sortie de ${formatFcfa(amount)} n'a pas été enregistrée en caisse.`
      )
    }
  }

  await tx.sql`
    INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
    VALUES (${input.companyId}, ${input.userId}, 'create', 'supplier_payment', ${payment.id},
      ${JSON.stringify({ purchase_order_id: po.id, amount, method: input.method, payment_number: paymentNumber })}::jsonb)
  `

  return {
    payment: { ...payment, cash_movement_id: cashMovementId },
    remaining: money(remaining - amount),
    warnings,
  }
}

/**
 * Annule un règlement : statut 'cancelled', paid_amount du bon diminué et,
 * si une sortie de caisse avait été passée, contre-passation (entrée en
 * caisse 'supplier_payment_cancel') sur la session ouverte.
 */
export async function cancelSupplierPayment(
  tx: Tx,
  input: { companyId: string; purchaseOrderId: string; paymentId: string; userId: string; reason?: string | null }
) {
  const [po] = await tx.sql<{ id: string; order_number: string }>`
    SELECT id, order_number FROM purchase_orders
    WHERE id = ${input.purchaseOrderId} AND company_id = ${input.companyId}
    FOR UPDATE
  `
  if (!po) throw notFound('Commande')

  const [payment] = await tx.sql`
    SELECT * FROM supplier_payments
    WHERE id = ${input.paymentId} AND purchase_order_id = ${po.id} AND company_id = ${input.companyId}
    FOR UPDATE
  `
  if (!payment) throw notFound('Règlement')
  if (payment.status === 'cancelled') {
    throw new AppError(409, 'Ce règlement est déjà annulé', 'ALREADY_CANCELLED')
  }
  // L'annulation modifie le mois du règlement d'origine : refusée s'il est clôturé
  await assertPeriodOpen(tx.sql, input.companyId, payment.paid_at)

  const amount = money(Number(payment.amount))
  const reason = input.reason?.trim() || null
  const [updated] = await tx.sql`
    UPDATE supplier_payments SET
      status = 'cancelled', cancelled_at = NOW(), cancelled_by = ${input.userId}, cancel_reason = ${reason}
    WHERE id = ${payment.id}
    RETURNING *
  `
  await tx.sql`
    UPDATE purchase_orders SET paid_amount = GREATEST(COALESCE(paid_amount, 0) - ${amount}, 0), updated_at = NOW()
    WHERE id = ${po.id}
  `

  const warnings: string[] = []
  if (payment.cash_movement_id) {
    const movement = await recordCashMovement(tx.sql, {
      companyId: input.companyId,
      movementType: 'cash_in',
      category: 'supplier_payment_cancel',
      amount,
      description: `Annulation du paiement fournisseur ${payment.payment_number} (${po.order_number})${reason ? ` — ${reason}` : ''}`,
      referenceType: 'supplier_payment',
      referenceId: payment.id,
      userId: input.userId,
    })
    if (!movement) {
      warnings.push(
        `Aucune caisse ouverte : pensez à remettre ${formatFcfa(amount)} en caisse à la prochaine ouverture.`
      )
    }
  }

  await tx.sql`
    INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
    VALUES (${input.companyId}, ${input.userId}, 'cancel', 'supplier_payment', ${payment.id},
      ${JSON.stringify({ purchase_order_id: po.id, amount, reason })}::jsonb)
  `

  return { payment: updated, warnings }
}
