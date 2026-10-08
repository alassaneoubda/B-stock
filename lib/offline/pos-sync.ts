import { withTransaction, type Tx } from '../db'
import { AppError } from '../errors'
import { nextDocumentNumber } from '../sequences'
import { assertOwned } from '../tenant'
import { money } from '../domain/sales'
import { payPosOrderInTx, type PosActor } from '../domain/pos'
import { claimSaleRequest } from './idempotency'

/**
 * Synchronisation d'une vente du point de vente saisie SANS RÉSEAU.
 *
 * Deux cas :
 * - vente directe (comptoir hors ligne) : un ticket est créé et encaissé dans la
 *   même transaction (le ticket garde la trace pour les rapports du POS) ;
 * - encaissement hors ligne d'un ticket ouvert (table) : le ticket n'est encaissé
 *   que s'il est encore ouvert ET identique à ce que l'appareil a encaissé
 *   (sinon TICKET_CHANGED → « Ventes à vérifier »).
 *
 * Toujours au comptant (espèces ou Mobile Money saisi à la main) : l'ardoise et
 * le paiement partiel exigent le contrôle du plafond par le serveur.
 *
 * Idempotence : la clé de l'appareil (clientRequestId) est verrouillée puis
 * cherchée AVANT toute écriture : un renvoi renvoie la vente déjà créée.
 */

export type OfflinePosSaleInput = {
  clientRequestId: string
  depotId: string
  posOrderId?: string | null
  label?: string | null
  paymentMethod: 'cash' | 'mobile_money'
  soldAt?: string | null
  items: { variantId: string; quantity: number; unitPrice: number }[]
  /** L'utilisateur accepte les prix actuels du catalogue (après un refus PRICE_CHANGED). */
  acceptCurrentPrices?: boolean
}

export type OfflinePosSaleResult = {
  saleId: string
  orderNumber: string
  ticketNumber: string | null
  replayed: boolean
  warnings: string[]
}

function sumByVariant(items: { variantId: string; quantity: number }[]) {
  const map = new Map<string, number>()
  for (const i of items) map.set(i.variantId, (map.get(i.variantId) ?? 0) + i.quantity)
  return map
}

async function replayResult(
  tx: Tx,
  sale: Record<string, unknown>
): Promise<OfflinePosSaleResult> {
  const [ticket] = await tx.sql`SELECT ticket_number FROM pos_orders WHERE sales_order_id = ${sale.id} LIMIT 1`
  return {
    saleId: sale.id as string,
    orderNumber: sale.order_number as string,
    ticketNumber: (ticket?.ticket_number as string | undefined) ?? null,
    replayed: true,
    warnings: [],
  }
}

export async function recordOfflinePosSale(actor: PosActor, input: OfflinePosSaleInput): Promise<OfflinePosSaleResult> {
  return withTransaction(async (tx) => {
    const existing = await claimSaleRequest(tx, actor.companyId, input.clientRequestId)
    if (existing) return replayResult(tx, existing)

    const variantIds = [...new Set(input.items.map((i) => i.variantId))]
    await assertOwned(tx.sql, actor.companyId, { depots: [input.depotId], variants: variantIds })
    const wanted = sumByVariant(input.items)
    const deviceTotal = money(input.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))
    const warnings: string[] = []
    let orderId: string
    let ticketNumber: string

    if (input.posOrderId) {
      // ---- Ticket ouvert encaissé hors ligne : il doit être resté identique ----
      const [order] = await tx.sql`
        SELECT id, status, ticket_number, depot_id FROM pos_orders
        WHERE id = ${input.posOrderId} AND company_id = ${actor.companyId}
        FOR UPDATE
      `
      if (!order) throw new AppError(404, 'Ticket introuvable', 'NOT_FOUND')
      if (order.status !== 'open') {
        throw new AppError(
          409,
          `Le ticket ${order.ticket_number} a déjà été ${order.status === 'paid' ? 'encaissé' : 'annulé'} sur un autre appareil.`,
          'ORDER_CLOSED'
        )
      }
      const rows = await tx.sql`
        SELECT product_variant_id, SUM(quantity)::int AS quantity, SUM(quantity * unit_price)::float AS total
        FROM pos_order_items WHERE pos_order_id = ${order.id} AND status = 'active'
        GROUP BY product_variant_id
      `
      const serverQty = new Map(rows.map((r) => [r.product_variant_id as string, Number(r.quantity)]))
      const serverTotal = money(rows.reduce((s, r) => s + Number(r.total), 0))
      const same =
        serverQty.size === wanted.size &&
        [...wanted].every(([id, q]) => serverQty.get(id) === q) &&
        Math.abs(serverTotal - deviceTotal) < 0.01
      if (!same) {
        throw new AppError(
          409,
          `Le ticket ${order.ticket_number} a été modifié sur un autre appareil pendant la coupure ` +
            `(total serveur ${serverTotal} FCFA, encaissé ${deviceTotal} FCFA). Vérifiez-le au point de vente.`,
          'TICKET_CHANGED'
        )
      }
      orderId = order.id
      ticketNumber = order.ticket_number
    } else {
      // ---- Vente directe : prix du catalogue (jamais ceux du navigateur, sauf contrôle) ----
      const prices = await tx.sql`
        SELECT pv.id, p.name, COALESCE(NULLIF(pv.price, 0), p.selling_price, 0)::float AS price
        FROM product_variants pv JOIN products p ON p.id = pv.product_id
        WHERE pv.id = ANY(${variantIds}::uuid[]) AND p.company_id = ${actor.companyId}
      `
      const priceOf = new Map(prices.map((p) => [p.id as string, money(Number(p.price))]))
      const changed = input.items.filter((i) => priceOf.get(i.variantId) !== money(i.unitPrice))
      if (changed.length > 0 && !input.acceptCurrentPrices) {
        const names = changed
          .map((c) => {
            const p = prices.find((x) => x.id === c.variantId)
            return `${p?.name ?? 'Produit'} (${c.unitPrice} → ${priceOf.get(c.variantId)} FCFA)`
          })
          .join(', ')
        throw new AppError(409, `Prix modifiés depuis la vente hors ligne : ${names}.`, 'PRICE_CHANGED', {
          changes: changed.map((c) => ({ variantId: c.variantId, offline: c.unitPrice, current: priceOf.get(c.variantId) })),
        })
      }

      ticketNumber = await nextDocumentNumber(tx, actor.companyId, 'pos_ticket')
      const [order] = await tx.sql`
        INSERT INTO pos_orders (company_id, depot_id, ticket_number, order_type, label, notes, opened_by)
        VALUES (
          ${actor.companyId}, ${input.depotId}, ${ticketNumber}, 'counter',
          ${input.label?.trim() || null}, 'Vente saisie hors ligne', ${actor.userId}
        )
        RETURNING id
      `
      orderId = order.id
      for (const [variantId, quantity] of wanted) {
        await tx.sql`
          INSERT INTO pos_order_items (pos_order_id, product_variant_id, quantity, unit_price, added_by)
          VALUES (${orderId}, ${variantId}, ${quantity}, ${priceOf.get(variantId) ?? 0}, ${actor.userId})
        `
      }
      const serverTotal = money([...wanted].reduce((s, [id, q]) => s + q * (priceOf.get(id) ?? 0), 0))
      if (changed.length > 0 && serverTotal !== deviceTotal) {
        warnings.push(
          `Vente enregistrée aux prix actuels : ${serverTotal} FCFA au lieu de ${deviceTotal} FCFA encaissés. Ajustez la caisse si besoin.`
        )
      }
    }

    const [{ total }] = await tx.sql`
      SELECT COALESCE(SUM(quantity * unit_price), 0)::float AS total
      FROM pos_order_items WHERE pos_order_id = ${orderId} AND status = 'active'
    `
    const paid = await payPosOrderInTx(tx, actor, orderId, {
      paymentMethod: input.paymentMethod,
      paidAmount: money(Number(total)),
      clientRequestId: input.clientRequestId,
      offlineSoldAt: input.soldAt ?? undefined,
    })
    return {
      saleId: paid.saleId,
      orderNumber: paid.orderNumber,
      ticketNumber,
      replayed: false,
      warnings: [...warnings, ...paid.warnings],
    }
  })
}
