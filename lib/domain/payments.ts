import type { Tx } from '../db'
import { AppError, notFound } from '../errors'
import { createCashMovementFromPayment } from '../cash-automation'
import { assertPeriodOpen } from '../accounting/period-lock'

/**
 * Service UNIQUE d'encaissement des dettes client.
 *
 * Utilisé par POST /api/payments, POST /api/clients/[id]/payments et
 * POST /api/credits/[id]/pay : les trois chemins maintiennent ensemble
 * credit_notes, credit_payments, sales_orders, client_accounts, payments,
 * invoices et la caisse. À appeler DANS un `withTransaction`.
 *
 * Règles d'allocation (montants calculés en centimes entiers) :
 *  1. Le client est verrouillé (`SELECT ... FOR UPDATE` sur clients) : deux
 *     encaissements simultanés du même client sont sérialisés.
 *  2. Créances ouvertes du compte (`account_type`), statut pending / partial /
 *     overdue avec un reste dû > 0, verrouillées FOR UPDATE, dans l'ordre :
 *       - si `creditNoteId` : uniquement cette créance ;
 *       - sinon, si `salesOrderId` : d'abord la/les créances de cette vente,
 *       - puis échéance la plus ancienne (sans échéance en dernier), puis
 *         date de création la plus ancienne.
 *     Chaque créance reçoit min(reste dû, reste à allouer) : paid_amount +=,
 *     statut 'paid' si soldée sinon 'partial', une ligne credit_payments.
 *  3. Montant > total restant dû des créances retenues → 409
 *     « Montant supérieur à la dette restante (X FCFA) ».
 *  4. Données anciennes : aucune créance ouverte sur ce compte (et pas de
 *     `creditNoteId`) mais solde négatif → le plafond devient -solde ;
 *     le montant est alloué aux ventes impayées les plus anciennes
 *     (subtotal - paid_amount_products, ou packaging_total - paid_amount_packaging).
 *     Solde ≥ 0 et aucune créance → 409 « Aucune dette à régler ».
 *  5. Ventes liées : paid_amount et paid_amount_products / paid_amount_packaging
 *     += part allouée ; facture client liée (invoices.order_id, non annulée) :
 *     amount_paid +=, remaining_amount = max(total - payé, 0), statut 'paid'
 *     si reste ≤ 0 sinon 'partial'.
 *  6. client_accounts.balance += montant (upsert sur (client_id, account_type)).
 *  7. Une ligne payments (payment_type = compte, status completed) ;
 *     sales_order_id = vente fournie si elle a reçu une part, sinon la vente
 *     unique touchée par l'allocation, sinon NULL.
 *  8. Paiement en espèces : mouvement de caisse 'cash_in' / 'credit_payment'
 *     (référence = le paiement) sur la session ouverte, dans la même
 *     transaction ; sans caisse ouverte, un avertissement est renvoyé.
 */

export const PAYMENT_METHODS = [
  'cash',
  'mobile_money',
  'bank_transfer',
  'orange_money',
  'mtn_money',
  'wave',
  'check',
] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export type AccountType = 'product' | 'packaging'

export type ApplyClientPaymentInput = {
  companyId: string
  clientId: string
  amount: number
  accountType: AccountType
  method: string
  reference?: string | null
  notes?: string | null
  userId: string
  salesOrderId?: string | null
  creditNoteId?: string | null
}

export type PaymentAllocation = {
  creditNoteId: string | null
  salesOrderId: string | null
  amount: number
}

export type ApplyClientPaymentResult = {
  payment: Record<string, any>
  amount: number
  allocations: PaymentAllocation[]
  cashMovementId: string | null
  warnings: string[]
}

/** Arrondi monétaire à 2 décimales. */
export function money(value: number): number {
  return Math.round(value * 100) / 100
}

const toCents = (v: unknown) => Math.round(Number(v || 0) * 100)
const fromCents = (c: number) => c / 100

export function formatFcfa(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(amount)} FCFA`
}

type OpenNote = { id: string; sales_order_id: string | null; remaining: number }

async function lockClient(tx: Tx, companyId: string, clientId: string) {
  const [client] = await tx.sql`
    SELECT id, name FROM clients WHERE id = ${clientId} AND company_id = ${companyId} FOR UPDATE
  `
  if (!client) throw notFound('Client')
  return client
}

async function lockOpenNotes(
  tx: Tx,
  input: Pick<ApplyClientPaymentInput, 'companyId' | 'clientId' | 'accountType' | 'salesOrderId' | 'creditNoteId'>
): Promise<OpenNote[]> {
  const rows = await tx.sql`
    SELECT id, sales_order_id, total_amount, paid_amount
    FROM credit_notes
    WHERE company_id = ${input.companyId}
      AND client_id = ${input.clientId}
      AND COALESCE(account_type, 'product') = ${input.accountType}
      AND status IN ('pending', 'partial', 'overdue')
      AND total_amount > COALESCE(paid_amount, 0)
      AND (${input.creditNoteId ?? null}::uuid IS NULL OR id = ${input.creditNoteId ?? null}::uuid)
    ORDER BY
      CASE WHEN ${input.salesOrderId ?? null}::uuid IS NOT NULL
            AND sales_order_id = ${input.salesOrderId ?? null}::uuid THEN 0 ELSE 1 END,
      due_date ASC NULLS LAST,
      created_at ASC,
      id ASC
    FOR UPDATE
  `
  return rows.map((r) => ({
    id: r.id,
    sales_order_id: r.sales_order_id,
    remaining: toCents(r.total_amount) - toCents(r.paid_amount),
  }))
}

async function accountBalanceCents(tx: Tx, clientId: string, accountType: AccountType) {
  const [acc] = await tx.sql`
    SELECT balance FROM client_accounts WHERE client_id = ${clientId} AND account_type = ${accountType}
  `
  return toCents(acc?.balance)
}

/**
 * Dette encaissable d'un compte (en FCFA) : reste dû des créances ouvertes,
 * ou -solde pour les données anciennes sans créance. À appeler dans la
 * transaction, après avoir verrouillé le client.
 */
export async function getPayableDebt(
  tx: Tx,
  input: { companyId: string; clientId: string; accountType: AccountType }
): Promise<number> {
  const [row] = await tx.sql`
    SELECT COUNT(*)::int AS n, COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) AS remaining
    FROM credit_notes
    WHERE company_id = ${input.companyId}
      AND client_id = ${input.clientId}
      AND COALESCE(account_type, 'product') = ${input.accountType}
      AND status IN ('pending', 'partial', 'overdue')
      AND total_amount > COALESCE(paid_amount, 0)
  `
  if (Number(row.n) > 0) return money(Number(row.remaining))
  const balance = await accountBalanceCents(tx, input.clientId, input.accountType)
  return balance < 0 ? fromCents(-balance) : 0
}

/** Allocation « données anciennes » : ventes impayées les plus anciennes. */
async function legacyOrderAllocations(
  tx: Tx,
  input: ApplyClientPaymentInput,
  amountCents: number
): Promise<PaymentAllocation[]> {
  const orders =
    input.accountType === 'product'
      ? await tx.sql`
          SELECT id, COALESCE(subtotal, 0) - COALESCE(paid_amount_products, 0) AS due
          FROM sales_orders
          WHERE company_id = ${input.companyId} AND client_id = ${input.clientId}
            AND status <> 'cancelled'
            AND COALESCE(subtotal, 0) > COALESCE(paid_amount_products, 0)
          ORDER BY
            CASE WHEN ${input.salesOrderId ?? null}::uuid IS NOT NULL AND id = ${input.salesOrderId ?? null}::uuid THEN 0 ELSE 1 END,
            created_at ASC, id ASC
          FOR UPDATE`
      : await tx.sql`
          SELECT id, COALESCE(packaging_total, 0) - COALESCE(paid_amount_packaging, 0) AS due
          FROM sales_orders
          WHERE company_id = ${input.companyId} AND client_id = ${input.clientId}
            AND status <> 'cancelled'
            AND COALESCE(packaging_total, 0) > COALESCE(paid_amount_packaging, 0)
          ORDER BY
            CASE WHEN ${input.salesOrderId ?? null}::uuid IS NOT NULL AND id = ${input.salesOrderId ?? null}::uuid THEN 0 ELSE 1 END,
            created_at ASC, id ASC
          FOR UPDATE`

  const allocations: PaymentAllocation[] = []
  let left = amountCents
  for (const o of orders) {
    if (left <= 0) break
    const part = Math.min(toCents(o.due), left)
    if (part <= 0) continue
    allocations.push({ creditNoteId: null, salesOrderId: o.id, amount: fromCents(part) })
    left -= part
  }
  return allocations
}

export async function applyClientPayment(
  tx: Tx,
  input: ApplyClientPaymentInput
): Promise<ApplyClientPaymentResult> {
  const amountCents = Math.round(input.amount * 100)
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new AppError(400, 'Le montant doit être positif', 'INVALID_AMOUNT')
  }
  const amount = fromCents(amountCents)
  const warnings: string[] = []

  // Encaissement daté d'aujourd'hui : refusé si le mois est clôturé (avant toute écriture)
  await assertPeriodOpen(tx.sql, input.companyId)

  await lockClient(tx, input.companyId, input.clientId)

  if (input.salesOrderId) {
    const [order] = await tx.sql`
      SELECT id, client_id, status FROM sales_orders
      WHERE id = ${input.salesOrderId} AND company_id = ${input.companyId}
    `
    if (!order) throw notFound('Commande')
    if (order.client_id !== input.clientId) {
      throw new AppError(400, "Cette commande n'appartient pas à ce client", 'ORDER_CLIENT_MISMATCH')
    }
  }

  // ---- 1. Créances ouvertes (verrouillées) ----
  const notes = await lockOpenNotes(tx, input)
  let allocations: PaymentAllocation[] = []

  if (notes.length > 0) {
    const outstanding = notes.reduce((s, n) => s + n.remaining, 0)
    if (amountCents > outstanding) {
      throw new AppError(
        409,
        `Montant supérieur à la dette restante (${formatFcfa(fromCents(outstanding))})`,
        'AMOUNT_EXCEEDS_DEBT'
      )
    }
    let left = amountCents
    for (const note of notes) {
      if (left <= 0) break
      const partCents = Math.min(note.remaining, left)
      const part = fromCents(partCents)
      await tx.sql`
        UPDATE credit_notes SET
          paid_amount = COALESCE(paid_amount, 0) + ${part},
          status = CASE WHEN COALESCE(paid_amount, 0) + ${part} >= total_amount THEN 'paid' ELSE 'partial' END,
          updated_at = NOW()
        WHERE id = ${note.id}
      `
      await tx.sql`
        INSERT INTO credit_payments (credit_note_id, amount, payment_method, reference, notes, received_by)
        VALUES (${note.id}, ${part}, ${input.method}, ${input.reference ?? null}, ${input.notes ?? null}, ${input.userId})
      `
      allocations.push({ creditNoteId: note.id, salesOrderId: note.sales_order_id, amount: part })
      left -= partCents
    }
  } else {
    if (input.creditNoteId) {
      throw new AppError(409, 'Cette créance est déjà soldée', 'CREDIT_ALREADY_PAID')
    }
    // ---- Données anciennes : pas de créance, mais un solde négatif ----
    const balance = await accountBalanceCents(tx, input.clientId, input.accountType)
    if (balance >= 0) {
      throw new AppError(409, 'Aucune dette à régler pour ce compte', 'NO_DEBT')
    }
    if (amountCents > -balance) {
      throw new AppError(
        409,
        `Montant supérieur à la dette restante (${formatFcfa(fromCents(-balance))})`,
        'AMOUNT_EXCEEDS_DEBT'
      )
    }
    allocations = await legacyOrderAllocations(tx, input, amountCents)
  }

  // ---- 2. Ventes et factures liées ----
  const perOrder = new Map<string, number>()
  for (const a of allocations) {
    if (!a.salesOrderId) continue
    perOrder.set(a.salesOrderId, (perOrder.get(a.salesOrderId) ?? 0) + toCents(a.amount))
  }
  for (const [orderId, cents] of perOrder) {
    const part = fromCents(cents)
    if (input.accountType === 'product') {
      await tx.sql`
        UPDATE sales_orders SET
          paid_amount = COALESCE(paid_amount, 0) + ${part},
          paid_amount_products = COALESCE(paid_amount_products, 0) + ${part},
          updated_at = NOW()
        WHERE id = ${orderId} AND company_id = ${input.companyId}
      `
    } else {
      await tx.sql`
        UPDATE sales_orders SET
          paid_amount = COALESCE(paid_amount, 0) + ${part},
          paid_amount_packaging = COALESCE(paid_amount_packaging, 0) + ${part},
          updated_at = NOW()
        WHERE id = ${orderId} AND company_id = ${input.companyId}
      `
    }
    await tx.sql`
      UPDATE invoices SET
        amount_paid = COALESCE(amount_paid, 0) + ${part},
        remaining_amount = GREATEST(total_amount - (COALESCE(amount_paid, 0) + ${part}), 0),
        status = CASE WHEN total_amount - (COALESCE(amount_paid, 0) + ${part}) <= 0 THEN 'paid' ELSE 'partial' END,
        updated_at = NOW()
      WHERE company_id = ${input.companyId} AND order_id = ${orderId}
        AND type = 'client' AND status <> 'cancelled'
    `
  }

  // ---- 3. Compte client ----
  await tx.sql`
    INSERT INTO client_accounts (client_id, account_type, balance, last_transaction_at)
    VALUES (${input.clientId}, ${input.accountType}, ${amount}, NOW())
    ON CONFLICT (client_id, account_type)
    DO UPDATE SET balance = client_accounts.balance + EXCLUDED.balance,
                  last_transaction_at = NOW(), updated_at = NOW()
  `

  // ---- 4. Paiement ----
  const orderIds = [...perOrder.keys()]
  const paymentOrderId =
    input.salesOrderId && perOrder.has(input.salesOrderId)
      ? input.salesOrderId
      : orderIds.length === 1
        ? orderIds[0]
        : null
  const [payment] = await tx.sql`
    INSERT INTO payments (
      company_id, client_id, sales_order_id, amount,
      payment_method, payment_type, status, reference, notes, received_by
    ) VALUES (
      ${input.companyId}, ${input.clientId}, ${paymentOrderId}, ${amount},
      ${input.method}, ${input.accountType}, 'completed',
      ${input.reference ?? null}, ${input.notes ?? null}, ${input.userId}
    )
    RETURNING *
  `

  // ---- 5. Caisse (espèces uniquement) ----
  let cashMovementId: string | null = null
  if (input.method === 'cash') {
    const movement = await createCashMovementFromPayment(tx.sql, {
      companyId: input.companyId,
      paymentId: payment.id,
      amount,
      userId: input.userId,
      description: input.accountType === 'packaging' ? 'Encaissement dette emballages' : 'Encaissement dette produits',
    })
    if (movement) cashMovementId = movement.id
    else warnings.push(`Aucune caisse ouverte : l'encaissement de ${formatFcfa(amount)} en espèces n'a pas été porté en caisse.`)
  }

  return { payment, amount, allocations, cashMovementId, warnings }
}

/**
 * Avoir sur une vente (retour de marchandise / d'emballages) : réduit le
 * montant dû (total_amount) des créances ouvertes de cette vente pour ce
 * compte, pour que les créances restent égales à la dette réelle. Une créance
 * dont le reste dû tombe à 0 passe à 'paid'. Renvoie la part appliquée (FCFA) ;
 * l'appelant crédite client_accounts du montant TOTAL de l'avoir (la part non
 * appliquée devient un avoir en faveur du client).
 */
export async function applyCreditToOrderNotes(
  tx: Tx,
  input: { companyId: string; orderId: string; accountType: AccountType; amount: number }
): Promise<number> {
  let left = Math.round(input.amount * 100)
  if (left <= 0) return 0
  const notes = await tx.sql`
    SELECT id, total_amount, paid_amount FROM credit_notes
    WHERE company_id = ${input.companyId} AND sales_order_id = ${input.orderId}
      AND COALESCE(account_type, 'product') = ${input.accountType}
      AND status IN ('pending', 'partial', 'overdue')
      AND total_amount > COALESCE(paid_amount, 0)
    ORDER BY created_at ASC, id ASC
    FOR UPDATE
  `
  let applied = 0
  for (const n of notes) {
    if (left <= 0) break
    const remaining = toCents(n.total_amount) - toCents(n.paid_amount)
    const part = Math.min(remaining, left)
    if (part <= 0) continue
    const p = fromCents(part)
    await tx.sql`
      UPDATE credit_notes SET
        total_amount = total_amount - ${p},
        status = CASE
          WHEN total_amount - ${p} <= COALESCE(paid_amount, 0) THEN 'paid'
          WHEN COALESCE(paid_amount, 0) > 0 THEN 'partial'
          ELSE status END,
        updated_at = NOW()
      WHERE id = ${n.id}
    `
    applied += part
    left -= part
  }
  return fromCents(applied)
}
