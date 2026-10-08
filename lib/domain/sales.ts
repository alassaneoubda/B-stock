import { withTransaction, type Tx } from '../db'
import { AppError, notFound } from '../errors'
import { nextDocumentNumber } from '../sequences'
import { assertOwned } from '../tenant'
import { recordCashMovement } from '../cash-automation'
import { addStock, adjustPackagingStock, removeStock, roundCost } from './stock'
import { assertPeriodOpen } from '../accounting/period-lock'
import { effectiveRate, loadVariantRates, loadVatSettings, splitTtc, type VatSettings, type VatSplit } from '../vat'
import { attachSaleRequest, claimSaleRequest } from '../offline/idempotency'

/**
 * Règles métier des ventes (création, statuts, annulation).
 *
 * Conventions de solde client (client_accounts.balance) : NÉGATIF = le client doit.
 * Répartition d'un paiement : les produits d'abord, puis les emballages.
 */

export type SaleItemInput = {
  productVariantId: string
  quantity: number
  unitPrice: number
  lotNumber?: string
}

export type SalePackagingInput = {
  packagingTypeId: string
  quantityOut: number
  quantityIn: number
  unitPrice: number
}

export type CreateSaleInput = {
  companyId: string
  userId: string
  clientId: string
  depotId: string
  agentId?: string
  orderSource?: string
  paymentMethod: 'cash' | 'mobile_money' | 'credit' | 'mixed'
  paidAmount: number
  /** Part en espèces d'un paiement mixte (sinon tout le montant payé est compté en caisse). */
  cashAmount?: number
  notes?: string
  items: SaleItemInput[]
  packagingItems?: SalePackagingInput[]
  /** Clé d'idempotence générée par l'appareil (vente hors ligne) : la même clé ne crée qu'une vente. */
  clientRequestId?: string
  /** Heure de la vente sur l'appareil (vente hors ligne), conservée à titre d'information. */
  offlineSoldAt?: string
  /**
   * Paramètres TVA (optionnel) : lus sur l'entreprise si absents. Les prix
   * unitaires reçus sont des prix de vente TTC (cf. lib/vat.ts).
   */
  vat?: VatSettings
}

export type CreateSaleResult = {
  order: Record<string, unknown>
  warnings: string[]
  /** true quand la clé d'idempotence avait déjà servi : `order` est la vente existante. */
  replayed?: boolean
}

/** Arrondi monétaire (XOF : pas de centimes en pratique, on garde 2 décimales). */
export function money(value: number): number {
  return Math.round(value * 100) / 100
}

function formatFcfa(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount)} FCFA`
}

const ORDER_SOURCES = new Set(['in_person', 'phone', 'whatsapp', 'pos', 'other'])

export async function createSale(input: CreateSaleInput): Promise<CreateSaleResult> {
  return withTransaction((tx) => createSaleInTx(tx, input))
}

/**
 * Même logique que createSale, dans une transaction fournie par l'appelant
 * (ex. encaissement d'un ticket de point de vente : ticket clos et vente créée
 * atomiquement).
 */
export async function createSaleInTx(tx: Tx, input: CreateSaleInput): Promise<CreateSaleResult> {
  const { companyId, userId } = input
  const warnings: string[] = []

  // Même clé d'idempotence déjà traitée (vente hors ligne renvoyée) : vente existante, rien n'est rejoué
  const existing = input.clientRequestId ? await claimSaleRequest(tx, companyId, input.clientRequestId) : null
  if (existing) return { order: existing, warnings: [], replayed: true }

  // ---- Totaux (calculés côté serveur) ----
  const subtotal = money(input.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))
  const packagingItems = (input.packagingItems ?? []).filter((p) => p.quantityOut > 0 || p.quantityIn > 0)
  // Net emballages : positif = consignes dues par le client, négatif = vides rendus en plus.
  // Des vides rendus en plus sont déduits du prix des produits ; l'excédent éventuel
  // est porté au crédit du compte emballages du client.
  const packagingNet = money(packagingItems.reduce((s, p) => s + (p.quantityOut - p.quantityIn) * p.unitPrice, 0))
  const packagingDue = Math.max(0, packagingNet)
  const deduction = packagingNet < 0 ? -packagingNet : 0
  const productsDue = money(Math.max(0, subtotal - deduction))
  const excessDeduction = money(Math.max(0, deduction - subtotal))
  const totalAmount = money(subtotal + packagingNet)
  const amountDue = money(productsDue + packagingDue)

  // Le montant encaissé ne peut pas dépasser ce qui est dû (la monnaie rendue n'est pas un paiement)
  const paidAmount = money(Math.min(Math.max(0, input.paidAmount), amountDue))

  if ((input.paymentMethod === 'cash' || input.paymentMethod === 'mobile_money') && paidAmount < amountDue) {
    throw new AppError(
      400,
      `Paiement incomplet : ${formatFcfa(paidAmount)} encaissés sur ${formatFcfa(amountDue)}. ` +
        'Saisissez le montant total ou choisissez « Crédit » ou « Mixte ».',
      'INCOMPLETE_PAYMENT'
    )
  }

  const paidForProducts = money(Math.min(productsDue, paidAmount))
  const paidForPackaging = money(Math.min(packagingDue, paidAmount - paidForProducts))
  const productDebt = money(productsDue - paidForProducts)
  const packagingDebt = money(packagingDue - paidForPackaging)

  const cashAmount =
    input.paymentMethod === 'cash'
      ? paidAmount
      : input.paymentMethod === 'mixed'
        ? money(Math.min(paidAmount, Math.max(0, input.cashAmount ?? paidAmount)))
        : 0

  const order = await (async () => {
    // ---- Période comptable : une vente est datée d'aujourd'hui ----
    await assertPeriodOpen(tx.sql, companyId)

    // ---- Appartenance de toutes les références à l'entreprise ----
    await assertOwned(tx.sql, companyId, {
      depots: [input.depotId],
      variants: input.items.map((i) => i.productVariantId),
      packagingTypes: packagingItems.map((p) => p.packagingTypeId),
      agents: [input.agentId],
    })

    // Client verrouillé : sérialise les ventes simultanées d'un même client
    // (le contrôle du plafond de crédit reste exact sous concurrence).
    const [client] = await tx.sql`
      SELECT id, name, credit_limit, packaging_credit_limit, payment_terms_days
      FROM clients
      WHERE id = ${input.clientId} AND company_id = ${companyId} AND is_active = true
      FOR UPDATE
    `
    if (!client) throw notFound('Client')

    // ---- Plafonds de crédit (dès qu'une dette est créée, quel que soit le mode) ----
    if (productDebt > 0 || packagingDebt > 0) {
      const accounts = await tx.sql`
        SELECT account_type, balance FROM client_accounts WHERE client_id = ${client.id}
      `
      const debtOf = (type: string) =>
        Math.max(0, -Number(accounts.find((a) => a.account_type === type)?.balance ?? 0))

      const productLimit = Number(client.credit_limit || 0)
      if (productDebt > 0 && productLimit > 0 && debtOf('product') + productDebt > productLimit) {
        throw new AppError(
          409,
          `Plafond de crédit dépassé pour ${client.name} : dette actuelle ${formatFcfa(debtOf('product'))}, ` +
            `nouvelle dette ${formatFcfa(productDebt)}, plafond ${formatFcfa(productLimit)}.`,
          'CREDIT_LIMIT'
        )
      }
      const packagingLimit = Number(client.packaging_credit_limit || 0)
      if (packagingDebt > 0 && packagingLimit > 0 && debtOf('packaging') + packagingDebt > packagingLimit) {
        throw new AppError(
          409,
          `Plafond de consignes dépassé pour ${client.name} : dette actuelle ${formatFcfa(debtOf('packaging'))}, ` +
            `plafond ${formatFcfa(packagingLimit)}.`,
          'PACKAGING_CREDIT_LIMIT'
        )
      }
    }

    // Libellés produits (messages d'erreur de stock + lignes de facture)
    const variantRows = await tx.sql`
      SELECT pv.id, p.name AS product_name, pt.name AS packaging_name
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN packaging_types pt ON pt.id = pv.packaging_type_id
      WHERE pv.id = ANY(${input.items.map((i) => i.productVariantId)}::uuid[])
    `
    const labelOf = new Map(
      variantRows.map((v) => [v.id, v.packaging_name ? `${v.product_name} (${v.packaging_name})` : v.product_name])
    )

    // ---- TVA : décomposition figée par ligne (TTC = prix de vente, arrondi au franc par ligne) ----
    const vat = input.vat ?? (await loadVatSettings(tx.sql, companyId))
    const rates = vat.enabled
      ? await loadVariantRates(tx.sql, input.items.map((i) => i.productVariantId))
      : new Map<string, number | null>()
    const lineVat: (VatSplit | null)[] = input.items.map((i) =>
      vat.enabled ? splitTtc(money(i.quantity * i.unitPrice), effectiveRate(vat, rates.get(i.productVariantId))) : null
    )
    const totalVat = money(lineVat.reduce((s, l) => s + (l?.vat ?? 0), 0))
    const totalHt = money(lineVat.reduce((s, l) => s + (l?.ht ?? 0), 0))

    // ---- Commande ----
    const orderNumber = await nextDocumentNumber(tx, companyId, 'sale')
    const [created] = await tx.sql`
      INSERT INTO sales_orders (
        company_id, client_id, depot_id, agent_id, order_number, status, order_source,
        subtotal, packaging_total, total_amount,
        paid_amount, paid_amount_products, paid_amount_packaging,
        payment_method, notes, created_by
      ) VALUES (
        ${companyId}, ${client.id}, ${input.depotId}, ${input.agentId ?? null}, ${orderNumber}, 'confirmed',
        ${ORDER_SOURCES.has(input.orderSource ?? '') ? input.orderSource : 'in_person'},
        ${subtotal}, ${packagingNet}, ${totalAmount},
        ${paidAmount}, ${paidForProducts}, ${paidForPackaging},
        ${input.paymentMethod}, ${input.notes || null}, ${userId}
      )
      RETURNING *
    `
    const orderId = created.id as string
    if (input.clientRequestId) await attachSaleRequest(tx, orderId, input.clientRequestId, input.offlineSoldAt)

    // ---- Lignes produits + sortie de stock (FEFO ou lot imposé) ----
    for (const [index, item] of input.items.entries()) {
      const split = lineVat[index]
      const label = labelOf.get(item.productVariantId)
      const lots = await removeStock(tx, {
        companyId,
        depotId: input.depotId,
        variantId: item.productVariantId,
        quantity: item.quantity,
        lotNumber: item.lotNumber || null,
        movementType: 'sale',
        referenceType: 'sales_order',
        referenceId: orderId,
        userId,
        label,
      })
      // Coût de revient figé au moment de la vente (CMP du dépôt)
      const unitCost = roundCost(lots.reduce((s, l) => s + l.quantity * l.unitCost, 0) / item.quantity)
      const lotNumber = lots.length === 1 ? lots[0].lotNumber : item.lotNumber || null
      if (split) {
        await tx.sql`
          INSERT INTO sales_order_items (
            sales_order_id, product_variant_id, quantity, unit_price, total_price, lot_number, unit_cost,
            vat_rate, amount_ht, vat_amount
          ) VALUES (
            ${orderId}, ${item.productVariantId}, ${item.quantity}, ${item.unitPrice},
            ${money(item.quantity * item.unitPrice)}, ${lotNumber}, ${unitCost},
            ${split.rate}, ${split.ht}, ${split.vat}
          )
        `
      } else {
        await tx.sql`
          INSERT INTO sales_order_items (
            sales_order_id, product_variant_id, quantity, unit_price, total_price, lot_number, unit_cost
          ) VALUES (
            ${orderId}, ${item.productVariantId}, ${item.quantity}, ${item.unitPrice},
            ${money(item.quantity * item.unitPrice)}, ${lotNumber}, ${unitCost}
          )
        `
      }
    }
    if (vat.enabled) {
      // Totaux = somme des lignes (produits uniquement : les consignes ne portent pas de TVA)
      await tx.sql`UPDATE sales_orders SET total_ht = ${totalHt}, total_vat = ${totalVat} WHERE id = ${orderId}`
      created.total_ht = totalHt
      created.total_vat = totalVat
    }

    // ---- Emballages consignés ----
    for (const pkg of packagingItems) {
      await tx.sql`
        INSERT INTO sales_order_packaging_items (
          sales_order_id, packaging_type_id, quantity_out, quantity_in, unit_price
        ) VALUES (${orderId}, ${pkg.packagingTypeId}, ${pkg.quantityOut}, ${pkg.quantityIn}, ${pkg.unitPrice})
      `
      // Vides rendus d'abord (ils peuvent servir aux sorties de la même vente)
      await adjustPackagingStock(tx, { depotId: input.depotId, packagingTypeId: pkg.packagingTypeId, delta: pkg.quantityIn })
      await adjustPackagingStock(tx, { depotId: input.depotId, packagingTypeId: pkg.packagingTypeId, delta: -pkg.quantityOut })

      const netOut = pkg.quantityOut - pkg.quantityIn
      if (netOut !== 0) {
        await tx.sql`
          INSERT INTO packaging_transactions (
            company_id, client_id, sales_order_id, packaging_type_id, transaction_type,
            quantity, unit_price, total_amount, created_by
          ) VALUES (
            ${companyId}, ${client.id}, ${orderId}, ${pkg.packagingTypeId},
            ${netOut > 0 ? 'given' : 'returned'}, ${Math.abs(netOut)}, ${pkg.unitPrice},
            ${money(Math.abs(netOut) * pkg.unitPrice)}, ${userId}
          )
        `
      }
    }

    // ---- Comptes client ----
    const accountChanges: [string, number][] = [
      ['product', -productDebt],
      // Dette de consignes, ou crédit si les vides rendus dépassent le prix des produits
      ['packaging', excessDeduction > 0 ? excessDeduction : -packagingDebt],
    ]
    for (const [type, delta] of accountChanges) {
      if (delta === 0) continue
      await tx.sql`
        INSERT INTO client_accounts (client_id, account_type, balance, last_transaction_at)
        VALUES (${client.id}, ${type}, ${delta}, NOW())
        ON CONFLICT (client_id, account_type)
        DO UPDATE SET balance = client_accounts.balance + EXCLUDED.balance,
                      last_transaction_at = NOW(), updated_at = NOW()
      `
    }

    // ---- Créances (une par type de dette restante) ----
    const termsDays = Number(client.payment_terms_days || 0)
    const dueDate = termsDays > 0 ? new Date(Date.now() + termsDays * 86_400_000).toISOString().slice(0, 10) : null
    const debts: [string, number, number][] = [
      ['product', productsDue, paidForProducts],
      ['packaging', packagingDue, paidForPackaging],
    ]
    for (const [type, total, paid] of debts) {
      if (total - paid <= 0) continue
      const creditNumber = await nextDocumentNumber(tx, companyId, 'credit')
      await tx.sql`
        INSERT INTO credit_notes (
          company_id, client_id, sales_order_id, credit_number, account_type,
          total_amount, paid_amount, due_date, status, created_by
        ) VALUES (
          ${companyId}, ${client.id}, ${orderId}, ${creditNumber}, ${type},
          ${total}, ${paid}, ${dueDate}, ${paid > 0 ? 'partial' : 'pending'}, ${userId}
        )
      `
    }

    // ---- Paiements reçus ----
    const paid: [string, number][] = [
      ['product', paidForProducts],
      ['packaging', paidForPackaging],
    ]
    for (const [type, amount] of paid) {
      if (amount <= 0) continue
      await tx.sql`
        INSERT INTO payments (
          company_id, client_id, sales_order_id, amount, payment_method, payment_type, status, received_by
        ) VALUES (
          ${companyId}, ${client.id}, ${orderId}, ${amount}, ${input.paymentMethod}, ${type}, 'completed', ${userId}
        )
      `
    }

    // ---- Facture (dans la même transaction : pas de vente sans facture) ----
    const invoiceNumber = await nextDocumentNumber(tx, companyId, 'invoice_client')
    const [invoice] = await tx.sql`
      INSERT INTO invoices (
        invoice_number, type, company_id, client_id, order_id,
        total_ht, total_ttc, total_amount, amount_paid, remaining_amount, status
      ) VALUES (
        ${invoiceNumber}, 'client', ${companyId}, ${client.id}, ${orderId},
        ${amountDue}, ${amountDue}, ${amountDue}, ${paidAmount}, ${money(amountDue - paidAmount)},
        ${paidAmount >= amountDue ? 'paid' : paidAmount > 0 ? 'partial' : 'sent'}
      )
      RETURNING id
    `
    if (vat.enabled) {
      // TTC = montant dû ; HT = dû − TVA (consignes et déduction des vides : hors champ de la TVA)
      await tx.sql`
        UPDATE invoices SET total_ht = ${money(amountDue - totalVat)}, total_vat = ${totalVat} WHERE id = ${invoice.id}
      `
    }
    for (const [index, item] of input.items.entries()) {
      const split = lineVat[index]
      if (split) {
        await tx.sql`
          INSERT INTO invoice_items (
            invoice_id, product_id, description, quantity, unit_price, total_price, item_type,
            vat_rate, amount_ht, vat_amount
          ) VALUES (
            ${invoice.id}, ${item.productVariantId}, ${labelOf.get(item.productVariantId) ?? 'Produit'},
            ${item.quantity}, ${item.unitPrice}, ${money(item.quantity * item.unitPrice)}, 'product',
            ${split.rate}, ${split.ht}, ${split.vat}
          )
        `
      } else {
        await tx.sql`
          INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, total_price, item_type)
          VALUES (
            ${invoice.id}, ${item.productVariantId}, ${labelOf.get(item.productVariantId) ?? 'Produit'},
            ${item.quantity}, ${item.unitPrice}, ${money(item.quantity * item.unitPrice)}, 'product'
          )
        `
      }
    }
    if (deduction > 0 && subtotal > 0) {
      const applied = money(Math.min(deduction, subtotal))
      await tx.sql`
        INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, total_price, item_type)
        VALUES (${invoice.id}, NULL, 'Déduction vides rendus', 1, ${-applied}, ${-applied}, 'packaging')
      `
    }
    for (const pkg of packagingItems) {
      const net = pkg.quantityOut - pkg.quantityIn
      if (net <= 0 || pkg.unitPrice <= 0) continue
      await tx.sql`
        INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, total_price, item_type)
        VALUES (${invoice.id}, ${pkg.packagingTypeId}, 'Consigne emballages', ${net}, ${pkg.unitPrice},
                ${money(net * pkg.unitPrice)}, 'packaging')
      `
    }

    // ---- Caisse : encaissement espèces sur la session ouverte du dépôt (ou de l'entreprise) ----
    if (cashAmount > 0) {
      // Verrou partagé sur la session : une clôture concurrente ne peut pas l'oublier
      const movement = await recordCashMovement(tx.sql, {
        companyId,
        movementType: 'cash_in',
        category: 'sale',
        amount: cashAmount,
        description: `Vente ${orderNumber}`,
        referenceType: 'sales_order',
        referenceId: orderId,
        userId,
      })
      if (!movement) {
        warnings.push("Aucune caisse n'est ouverte : l'encaissement en espèces n'a pas été enregistré en caisse.")
      }
    }

    return created
  })()

  return { order, warnings }
}

// ---------------------------------------------------------------------------
// Statuts
// ---------------------------------------------------------------------------

export const SALE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'] as const
export type SaleStatus = (typeof SALE_STATUSES)[number]

/** Transitions autorisées (on peut sauter des étapes vers l'avant, jamais revenir). */
const NEXT_STATUSES: Record<SaleStatus, SaleStatus[]> = {
  pending: ['confirmed', 'preparing', 'ready', 'delivered', 'cancelled'],
  confirmed: ['preparing', 'ready', 'delivered', 'cancelled'],
  preparing: ['ready', 'delivered', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

const STATUS_LABELS: Record<SaleStatus, string> = {
  pending: 'en attente',
  confirmed: 'confirmée',
  preparing: 'en préparation',
  ready: 'prête',
  delivered: 'livrée',
  cancelled: 'annulée',
}

export async function changeSaleStatus(input: {
  companyId: string
  userId: string
  orderId: string
  status: SaleStatus
}): Promise<{ order: Record<string, unknown>; warnings: string[] }> {
  return withTransaction(async (tx) => {
    const [order] = await tx.sql`
      SELECT * FROM sales_orders WHERE id = ${input.orderId} AND company_id = ${input.companyId} FOR UPDATE
    `
    if (!order) throw notFound('Commande')

    const current = order.status as SaleStatus
    if (current === input.status) return { order, warnings: [] }
    // Annuler une vente modifie les documents de son mois (facture, encaissements, stock)
    if (input.status === 'cancelled') await assertPeriodOpen(tx.sql, input.companyId, order.created_at)
    if (!NEXT_STATUSES[current]?.includes(input.status)) {
      throw new AppError(
        409,
        `Impossible de passer une vente ${STATUS_LABELS[current] ?? current} à « ${STATUS_LABELS[input.status]} ».`,
        'INVALID_TRANSITION'
      )
    }

    const warnings = input.status === 'cancelled' ? await reverseSale(tx, order, input.userId) : []

    const [updated] = await tx.sql`
      UPDATE sales_orders SET status = ${input.status}, updated_at = NOW()
      WHERE id = ${input.orderId} AND company_id = ${input.companyId}
      RETURNING *
    `
    return { order: updated, warnings }
  })
}

/**
 * Contre-passation complète d'une vente annulée : stock, emballages, dette,
 * créances, paiements, facture et caisse. Appelée dans la transaction de changeSaleStatus.
 */
async function reverseSale(tx: Tx, order: any, userId: string): Promise<string[]> {
  const warnings: string[] = []
  const companyId = order.company_id as string
  const note = `Annulation ${order.order_number}`

  // Encaissements reçus APRÈS la vente (règlement de créance) : on refuse,
  // l'utilisateur doit d'abord traiter le remboursement.
  const [later] = await tx.sql`
    SELECT COUNT(*)::int AS n FROM credit_payments cp
    JOIN credit_notes cn ON cn.id = cp.credit_note_id
    WHERE cn.sales_order_id = ${order.id}
  `
  if (later.n > 0) {
    throw new AppError(
      409,
      'Cette vente a déjà fait l’objet de règlements de créance : utilisez un retour client plutôt qu’une annulation.',
      'HAS_LATER_PAYMENTS'
    )
  }

  // Ce que les retours ont déjà rendu au client (calculé AVANT la réintégration du stock ci-dessous)
  const alreadyGranted = await returnCreditGranted(tx, order)

  // 1. Stock : on réintègre les lots sortis, au coût figé à la vente, SAUF ce qui
  //    est déjà revenu par un retour (sinon la marchandise serait comptée deux fois) :
  //    - retours directs (/api/sales/[id]/return) : mouvements 'return' référencés sur la vente ;
  //    - retours /api/returns non rejetés liés à la vente (même règle que le plafond des retours).
  const movements = await tx.sql`
    SELECT depot_id, product_variant_id, lot_number, quantity, unit_cost FROM stock_movements
    WHERE company_id = ${companyId} AND reference_type = 'sales_order'
      AND reference_id = ${order.id} AND movement_type = 'sale'
    ORDER BY created_at, id
  `
  const returnedRows = await tx.sql`
    SELECT product_variant_id, SUM(qty)::int AS qty FROM (
      SELECT sm.product_variant_id, sm.quantity AS qty FROM stock_movements sm
      WHERE sm.company_id = ${companyId} AND sm.movement_type = 'return'
        AND sm.reference_type = 'sales_order' AND sm.reference_id = ${order.id}
      UNION ALL
      SELECT ri.product_variant_id, ri.quantity AS qty FROM return_items ri
      JOIN returns r ON r.id = ri.return_id
      WHERE r.sales_order_id = ${order.id} AND r.company_id = ${companyId}
        AND r.status <> 'rejected' AND ri.item_type = 'product' AND ri.product_variant_id IS NOT NULL
    ) t
    GROUP BY product_variant_id
  `
  const alreadyReturned = new Map<string, number>(
    returnedRows.map((r) => [r.product_variant_id as string, Math.max(0, Number(r.qty))])
  )
  for (const m of movements) {
    let qty = -Number(m.quantity)
    if (qty <= 0) continue
    // Le déjà-retourné est imputé sur les premiers lots sortis
    const returned = alreadyReturned.get(m.product_variant_id) ?? 0
    const skip = Math.min(returned, qty)
    if (skip > 0) alreadyReturned.set(m.product_variant_id, returned - skip)
    qty -= skip
    if (qty <= 0) continue
    await addStock(tx, {
      companyId,
      depotId: m.depot_id,
      variantId: m.product_variant_id,
      quantity: qty,
      lotNumber: m.lot_number,
      unitCost: m.unit_cost == null ? null : Number(m.unit_cost),
      movementType: 'return',
      referenceType: 'sales_order',
      referenceId: order.id,
      userId,
      notes: note,
    })
  }

  // 2. Emballages : on inverse les sorties / retours de vides
  const pkgItems = await tx.sql`
    SELECT packaging_type_id, quantity_out, quantity_in FROM sales_order_packaging_items
    WHERE sales_order_id = ${order.id}
  `
  for (const p of pkgItems) {
    await adjustPackagingStock(tx, { depotId: order.depot_id, packagingTypeId: p.packaging_type_id, delta: Number(p.quantity_out) })
    await adjustPackagingStock(tx, { depotId: order.depot_id, packagingTypeId: p.packaging_type_id, delta: -Number(p.quantity_in) })
  }
  await tx.sql`DELETE FROM packaging_transactions WHERE sales_order_id = ${order.id} AND company_id = ${companyId}`

  // 3. Dettes : on annule ce qui reste dû sur les créances de la vente
  const credits = await tx.sql`
    SELECT id, account_type, total_amount, paid_amount FROM credit_notes
    WHERE sales_order_id = ${order.id} AND company_id = ${companyId} AND status IN ('pending', 'partial', 'overdue')
    FOR UPDATE
  `
  for (const c of credits) {
    const remaining = money(Number(c.total_amount) - Number(c.paid_amount))
    if (remaining > 0) {
      await tx.sql`
        UPDATE client_accounts SET balance = balance + ${remaining}, last_transaction_at = NOW(), updated_at = NOW()
        WHERE client_id = ${order.client_id} AND account_type = ${c.account_type}
      `
    }
    await tx.sql`
      UPDATE credit_notes SET status = 'written_off', notes = ${note}, updated_at = NOW() WHERE id = ${c.id}
    `
  }
  // Crédit de consignes accordé quand les vides rendus dépassaient le prix des produits
  const packagingNet = Number(order.packaging_total)
  const excessDeduction = money(Math.max(0, -packagingNet - Number(order.subtotal)))
  if (excessDeduction > 0) {
    await tx.sql`
      UPDATE client_accounts SET balance = balance - ${excessDeduction}, updated_at = NOW()
      WHERE client_id = ${order.client_id} AND account_type = 'packaging'
    `
  }

  // 4. Paiements et caisse : remboursement de ce qui a été payé, MOINS ce que les
  //    retours ont déjà rendu au client (avoir porté à son compte ou remboursement
  //    en espèces du module Retours) : on ne rembourse jamais deux fois.
  await tx.sql`
    UPDATE payments SET status = 'refunded' WHERE sales_order_id = ${order.id} AND company_id = ${companyId}
  `
  const [cashIn] = await tx.sql`
    SELECT COALESCE(SUM(amount), 0) AS total FROM cash_movements
    WHERE company_id = ${companyId} AND reference_type = 'sales_order' AND reference_id = ${order.id}
      AND movement_type = 'cash_in'
  `
  const refundDue = money(Math.max(0, Number(order.paid_amount || 0) - alreadyGranted))
  const cashToRefund = money(Math.min(Number(cashIn.total), refundDue))
  const otherToRefund = money(refundDue - cashToRefund)
  if (alreadyGranted > 0 && Number(order.paid_amount || 0) > 0) {
    warnings.push(
      `${formatFcfa(Math.min(alreadyGranted, Number(order.paid_amount)))} déjà rendus au client par les retours ` +
        '(avoir ou remboursement) : déduits du remboursement.'
    )
  }
  if (otherToRefund > 0) {
    warnings.push(`Remboursez ${formatFcfa(otherToRefund)} au client (paiement hors espèces).`)
  }
  if (cashToRefund > 0) {
    const movement = await recordCashMovement(tx.sql, {
      companyId,
      movementType: 'cash_out',
      category: 'refund',
      amount: cashToRefund,
      description: note,
      referenceType: 'sales_order',
      referenceId: order.id,
      userId,
    })
    if (!movement) {
      warnings.push(
        `Aucune caisse ouverte : pensez à enregistrer la sortie de ${formatFcfa(cashToRefund)} remboursés au client.`
      )
    }
  }

  // 5. Facture
  await tx.sql`
    UPDATE invoices SET status = 'cancelled', updated_at = NOW()
    WHERE order_id = ${order.id} AND company_id = ${companyId} AND type = 'client'
  `

  return warnings
}

/**
 * Valeur déjà RENDUE au client par les retours d'une vente, au-delà de la dette
 * qu'ils ont effacée (FCFA, ≥ 0). À l'annulation, cette part n'est pas
 * remboursée une seconde fois.
 *
 * Un retour crédite le client de R (prix de la vente d'origine) :
 *  - retour direct (/api/sales/[id]/return) : mouvements de stock 'return'
 *    référencés sur la vente × prix moyen de la vente, + vides rendus après la
 *    vente (transactions d'emballages 'returned' postérieures à la vente) ;
 *  - module Retours avec avoir : avoirs AV (credit_notes < 0) liés à la vente ;
 *  - module Retours remboursé en espèces : lignes du retour traité.
 * Une partie A de ce crédit a seulement réduit la dette de la vente (créances
 * de la vente : total d'origine − total actuel) ; le reste R − A a été rendu
 * (avoir au compte du client ou espèces).
 *
 * Appelée AVANT la réintégration du stock de l'annulation (qui crée elle-même
 * des mouvements 'return' référencés sur la vente).
 */
export async function returnCreditGranted(tx: Tx, order: { id: string; company_id: string }): Promise<number> {
  const [row] = await tx.sql`
    SELECT
      COALESCE((
        SELECT SUM(ROUND(sm.quantity * COALESCE(sp.avg_price, 0), 2))
        FROM stock_movements sm
        LEFT JOIN LATERAL (
          SELECT SUM(COALESCE(i.total_price, i.quantity * i.unit_price)) / NULLIF(SUM(i.quantity), 0) AS avg_price
          FROM sales_order_items i
          WHERE i.sales_order_id = sm.reference_id AND i.product_variant_id = sm.product_variant_id
        ) sp ON true
        WHERE sm.company_id = ${order.company_id} AND sm.movement_type = 'return'
          AND sm.reference_type = 'sales_order' AND sm.reference_id = ${order.id} AND sm.quantity > 0
      ), 0)
      + COALESCE((
        SELECT SUM(COALESCE(pt.total_amount, pt.quantity * pt.unit_price, 0))
        FROM packaging_transactions pt
        JOIN sales_orders so ON so.id = pt.sales_order_id
        WHERE pt.sales_order_id = ${order.id} AND pt.company_id = ${order.company_id}
          AND pt.transaction_type = 'returned' AND pt.created_at <> so.created_at
      ), 0)
      + COALESCE((
        SELECT SUM(-cn.total_amount) FROM credit_notes cn
        WHERE cn.sales_order_id = ${order.id} AND cn.company_id = ${order.company_id} AND cn.total_amount < 0
      ), 0)
      + COALESCE((
        SELECT SUM(COALESCE(ri.total_price, ri.quantity * ri.unit_price, 0))
        FROM returns r JOIN return_items ri ON ri.return_id = r.id
        WHERE r.sales_order_id = ${order.id} AND r.company_id = ${order.company_id}
          AND r.return_type = 'client' AND r.status = 'processed' AND r.refund_method = 'cash'
      ), 0) AS credited,
      COALESCE((
        SELECT SUM(
          CASE WHEN COALESCE(cn.account_type, 'product') = 'packaging'
               THEN GREATEST(COALESCE(so.packaging_total, 0), 0)
               ELSE GREATEST(COALESCE(so.subtotal, 0) - GREATEST(-COALESCE(so.packaging_total, 0), 0), 0)
          END - cn.total_amount)
        FROM credit_notes cn
        JOIN sales_orders so ON so.id = cn.sales_order_id
        WHERE cn.sales_order_id = ${order.id} AND cn.company_id = ${order.company_id}
          AND cn.total_amount >= 0 AND cn.created_at = so.created_at
      ), 0) AS applied_to_debt
  `
  return money(Math.max(0, Number(row.credited) - Math.max(0, Number(row.applied_to_debt))))
}

/**
 * Coût de revient moyen d'une variante sur une vente (coût figé à la vente).
 * Sert à réintégrer un retour client au coût d'origine. `null` si inconnu.
 */
export async function saleUnitCost(tx: Tx, orderId: string, variantId: string): Promise<number | null> {
  const [row] = await tx.sql<{ unit_cost: string | null }>`
    SELECT SUM(quantity * unit_cost) / NULLIF(SUM(quantity), 0) AS unit_cost
    FROM sales_order_items
    WHERE sales_order_id = ${orderId} AND product_variant_id = ${variantId} AND unit_cost IS NOT NULL
  `
  return row?.unit_cost == null ? null : roundCost(Number(row.unit_cost))
}
