import { sql, withTransaction, type Tx } from '../db'
import { AppError, notFound } from '../errors'
import { nextDocumentNumber } from '../sequences'
import { assertOwned } from '../tenant'
import { createSaleInTx, money } from './sales'
import { lockStockCosts, unpackStock } from './stock'

/**
 * Point de vente (maquis, bars, comptoir).
 *
 * Cycle d'un ticket : open → (articles ajoutés au fil du service) → paid | cancelled.
 * - Les quantités des tickets ouverts sont RÉSERVÉES : on ne peut pas servir
 *   plus que le stock du dépôt moins ce qui est déjà promis aux autres tables.
 * - Le stock n'est décrémenté qu'à l'encaissement, par la vente créée
 *   (createSaleInTx) dans la même transaction que la clôture du ticket.
 * - Les prix viennent du catalogue (jamais du navigateur).
 * - Retirer un article déjà servi = annulation tracée (motif + droit pos.manage),
 *   sauf correction immédiate (même serveur, moins de CORRECTION_WINDOW_MS).
 */

export const CORRECTION_WINDOW_MS = 5 * 60 * 1000

export type PosActor = {
  companyId: string
  userId: string
  /** Droit pos.manage (gérant) : annulations, tables, corrections tardives. */
  canManage: boolean
}

type OrderRow = {
  id: string
  company_id: string
  depot_id: string
  table_id: string | null
  client_id: string | null
  ticket_number: string
  order_type: string
  status: 'open' | 'paid' | 'cancelled'
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/** Dépôt du point de vente : celui demandé, sinon le dépôt principal. */
export async function resolvePosDepot(companyId: string, depotId?: string | null): Promise<string> {
  if (depotId) {
    await assertOwned(sql, companyId, { depots: [depotId] })
    return depotId
  }
  const [depot] = await sql`
    SELECT id FROM depots WHERE company_id = ${companyId}
    ORDER BY is_main DESC, created_at ASC LIMIT 1
  `
  if (!depot) throw new AppError(409, 'Créez d’abord un dépôt pour utiliser le point de vente', 'NO_DEPOT')
  return depot.id
}

/** Catalogue vendable avec la disponibilité réelle (stock − réservé par les tickets ouverts). */
export async function getPosCatalog(companyId: string, depotId: string) {
  return sql`
    SELECT pv.id AS variant_id, p.id AS product_id, p.name AS product_name, p.category, p.brand,
           pt.name AS packaging_name,
           COALESCE(NULLIF(pv.price, 0), p.selling_price, 0)::float AS price,
           COALESCE(st.qty, 0)::int AS stock,
           COALESCE(rs.qty, 0)::int AS reserved,
           GREATEST(COALESCE(st.qty, 0) - COALESCE(rs.qty, 0), 0)::int AS available,
           -- Unités supplémentaires obtenables en ouvrant les casiers liés (vente à la bouteille)
           COALESCE(op.units, 0)::int AS openable
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN packaging_types pt ON pt.id = pv.packaging_type_id
    LEFT JOIN (
      SELECT product_variant_id, SUM(quantity) AS qty FROM stock
      WHERE depot_id = ${depotId} GROUP BY product_variant_id
    ) st ON st.product_variant_id = pv.id
    LEFT JOIN (
      SELECT i.product_variant_id, SUM(i.quantity) AS qty
      FROM pos_order_items i JOIN pos_orders o ON o.id = i.pos_order_id
      WHERE o.company_id = ${companyId} AND o.depot_id = ${depotId} AND o.status = 'open' AND i.status = 'active'
      GROUP BY i.product_variant_id
    ) rs ON rs.product_variant_id = pv.id
    LEFT JOIN (
      SELECT pk.unit_variant_id,
             SUM(GREATEST(COALESCE(ks.qty, 0) - COALESCE(kr.qty, 0), 0) * COALESCE(kpt.units_per_case, 1)) AS units
      FROM product_variants pk
      JOIN products kp ON kp.id = pk.product_id AND kp.company_id = ${companyId}
      LEFT JOIN packaging_types kpt ON kpt.id = pk.packaging_type_id
      LEFT JOIN (
        SELECT product_variant_id, SUM(quantity) AS qty FROM stock
        WHERE depot_id = ${depotId} GROUP BY product_variant_id
      ) ks ON ks.product_variant_id = pk.id
      LEFT JOIN (
        SELECT i.product_variant_id, SUM(i.quantity) AS qty
        FROM pos_order_items i JOIN pos_orders o ON o.id = i.pos_order_id
        WHERE o.company_id = ${companyId} AND o.depot_id = ${depotId} AND o.status = 'open' AND i.status = 'active'
        GROUP BY i.product_variant_id
      ) kr ON kr.product_variant_id = pk.id
      WHERE pk.unit_variant_id IS NOT NULL
      GROUP BY pk.unit_variant_id
    ) op ON op.unit_variant_id = pv.id
    WHERE p.company_id = ${companyId} AND p.is_active = true
    ORDER BY p.category NULLS LAST, p.name, pt.name
  `
}

/** Réglage « ouvrir automatiquement un casier » du point de vente. */
export async function getPosAutoUnpack(companyId: string): Promise<boolean> {
  const [row] = await sql`SELECT pos_auto_unpack FROM companies WHERE id = ${companyId}`
  return row?.pos_auto_unpack === true
}

export async function setPosAutoUnpack(companyId: string, enabled: boolean): Promise<void> {
  await sql`UPDATE companies SET pos_auto_unpack = ${enabled} WHERE id = ${companyId}`
}

/** Casiers liés à une variante unité, du plus petit au plus grand (on ouvre le moins possible). */
async function packsForUnit(tx: Tx, unitVariantId: string) {
  return tx.sql<{ id: string; units_per_case: number; label: string }>`
    SELECT pk.id, COALESCE(pt.units_per_case, 1)::int AS units_per_case,
           p.name || COALESCE(' — ' || pt.name, '') AS label
    FROM product_variants pk
    JOIN products p ON p.id = pk.product_id
    LEFT JOIN packaging_types pt ON pt.id = pk.packaging_type_id
    WHERE pk.unit_variant_id = ${unitVariantId} AND COALESCE(pt.units_per_case, 1) > 1
    ORDER BY pt.units_per_case ASC, pk.id
  `
}

async function reservedQty(tx: Tx, companyId: string, depotId: string, variantId: string): Promise<number> {
  const [row] = await tx.sql`
    SELECT COALESCE(SUM(i.quantity), 0)::int AS qty
    FROM pos_order_items i JOIN pos_orders o ON o.id = i.pos_order_id
    WHERE o.company_id = ${companyId} AND o.depot_id = ${depotId}
      AND o.status = 'open' AND i.status = 'active' AND i.product_variant_id = ${variantId}
  `
  return Number(row.qty)
}

/** Vue « salle » : tables avec leur ticket ouvert + tickets sans table (comptoir). */
export async function getPosFloor(companyId: string, depotId: string) {
  const [tables, openOrders] = await Promise.all([
    sql`
      SELECT id, name, area, seats, sort_order FROM pos_tables
      WHERE company_id = ${companyId} AND is_active = true
        AND (depot_id IS NULL OR depot_id = ${depotId})
      ORDER BY sort_order, name
    `,
    sql`
      SELECT o.id, o.ticket_number, o.table_id, o.order_type, o.label, o.covers, o.opened_at,
             o.client_id, c.name AS client_name, u.full_name AS opened_by_name,
             COALESCE(SUM(i.quantity * i.unit_price) FILTER (WHERE i.status = 'active'), 0)::float AS total,
             COALESCE(SUM(i.quantity) FILTER (WHERE i.status = 'active'), 0)::int AS items_count,
             MAX(i.created_at) FILTER (WHERE i.status = 'active') AS last_item_at
      FROM pos_orders o
      LEFT JOIN pos_order_items i ON i.pos_order_id = o.id
      LEFT JOIN clients c ON c.id = o.client_id AND c.company_id = o.company_id AND c.is_walk_in = false
      LEFT JOIN users u ON u.id = o.opened_by
      WHERE o.company_id = ${companyId} AND o.depot_id = ${depotId} AND o.status = 'open'
      GROUP BY o.id, c.name, u.full_name
      ORDER BY o.opened_at
    `,
  ])
  return { tables, openOrders }
}

export async function getPosOrder(companyId: string, orderId: string) {
  const [order] = await sql`
    SELECT o.*, t.name AS table_name, c.name AS client_name, c.credit_limit AS client_credit_limit,
           u.full_name AS opened_by_name
    FROM pos_orders o
    LEFT JOIN pos_tables t ON t.id = o.table_id
    LEFT JOIN clients c ON c.id = o.client_id AND c.is_walk_in = false
    LEFT JOIN users u ON u.id = o.opened_by
    WHERE o.id = ${orderId} AND o.company_id = ${companyId}
  `
  if (!order) throw notFound('Ticket')
  const items = await sql`
    SELECT i.id, i.product_variant_id, i.quantity, i.unit_price::float AS unit_price, i.status,
           i.void_reason, i.created_at, i.added_by,
           p.name AS product_name, pt.name AS packaging_name, ua.full_name AS added_by_name
    FROM pos_order_items i
    JOIN product_variants pv ON pv.id = i.product_variant_id
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN packaging_types pt ON pt.id = pv.packaging_type_id
    LEFT JOIN users ua ON ua.id = i.added_by
    WHERE i.pos_order_id = ${orderId}
    ORDER BY i.created_at, i.id
  `
  const total = money(
    items.filter((i) => i.status === 'active').reduce((s, i) => s + i.quantity * i.unit_price, 0)
  )
  return { ...order, items, total }
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

async function lockOpenOrder(tx: Tx, companyId: string, orderId: string): Promise<OrderRow> {
  const [order] = await tx.sql<OrderRow>`
    SELECT * FROM pos_orders WHERE id = ${orderId} AND company_id = ${companyId} FOR UPDATE
  `
  if (!order) throw notFound('Ticket')
  if (order.status !== 'open') {
    throw new AppError(409, order.status === 'paid' ? 'Ce ticket est déjà encaissé' : 'Ce ticket est annulé', 'ORDER_CLOSED')
  }
  return order
}

export async function openPosOrder(
  actor: PosActor,
  input: {
    depotId: string
    tableId?: string | null
    orderType?: 'table' | 'counter' | 'takeaway'
    label?: string | null
    clientId?: string | null
    covers?: number | null
  }
) {
  return withTransaction(async (tx) => {
    await assertOwned(tx.sql, actor.companyId, {
      depots: [input.depotId],
      clients: [input.clientId],
    })

    if (input.tableId) {
      const [table] = await tx.sql`
        SELECT id FROM pos_tables
        WHERE id = ${input.tableId} AND company_id = ${actor.companyId} AND is_active = true
        FOR UPDATE
      `
      if (!table) throw notFound('Table')
      // Une table n'a qu'un ticket ouvert : on renvoie l'existant (double tap, deux serveurs)
      const [existing] = await tx.sql`
        SELECT id FROM pos_orders WHERE table_id = ${input.tableId} AND status = 'open'
      `
      if (existing) return { id: existing.id as string, created: false }
    }

    const ticketNumber = await nextDocumentNumber(tx, actor.companyId, 'pos_ticket')
    const [order] = await tx.sql`
      INSERT INTO pos_orders (
        company_id, depot_id, table_id, client_id, ticket_number, order_type, label, covers, opened_by
      ) VALUES (
        ${actor.companyId}, ${input.depotId}, ${input.tableId ?? null}, ${input.clientId ?? null},
        ${ticketNumber}, ${input.tableId ? 'table' : (input.orderType ?? 'counter')},
        ${input.label?.trim() || null}, ${input.covers ?? null}, ${actor.userId}
      )
      RETURNING id
    `
    return { id: order.id as string, created: true }
  })
}

/**
 * Ajoute des articles (prix catalogue), en respectant le stock disponible du dépôt.
 *
 * Vente à la bouteille : si le stock à l'unité ne suffit pas mais qu'un casier lié
 * est disponible, le casier est ouvert dans la même transaction quand
 * `options.unpack` est vrai ou que le réglage « ouverture automatique » de
 * l'entreprise est actif ; sinon 409 UNPACK_REQUIRED (le POS demande confirmation).
 */
export async function addPosItems(
  actor: PosActor,
  orderId: string,
  items: { variantId: string; quantity: number }[],
  options: { unpack?: boolean } = {}
) {
  return withTransaction(async (tx) => {
    const order = await lockOpenOrder(tx, actor.companyId, orderId)
    const variantIds = [...new Set(items.map((i) => i.variantId))]
    await assertOwned(tx.sql, actor.companyId, { variants: variantIds })
    let autoUnpack: boolean | null = null

    for (const variantId of variantIds) {
      const quantity = items.filter((i) => i.variantId === variantId).reduce((s, i) => s + i.quantity, 0)

      // Variante unité liée à des casiers : CMP verrouillés AVANT le stock (ordre stock_costs → stock)
      const packs = await packsForUnit(tx, variantId)
      if (packs.length > 0) {
        await lockStockCosts(tx, order.depot_id, [variantId, ...packs.map((p) => p.id)])
      }

      // Verrou sur le stock de la variante : sérialise les ajouts concurrents
      const stockRows = await tx.sql`
        SELECT quantity FROM stock
        WHERE depot_id = ${order.depot_id} AND product_variant_id = ${variantId}
        FOR UPDATE
      `
      const stock = stockRows.reduce((s, r) => s + Number(r.quantity), 0)
      const [reserved] = await tx.sql`
        SELECT COALESCE(SUM(i.quantity), 0)::int AS qty
        FROM pos_order_items i JOIN pos_orders o ON o.id = i.pos_order_id
        WHERE o.company_id = ${actor.companyId} AND o.depot_id = ${order.depot_id}
          AND o.status = 'open' AND i.status = 'active' AND i.product_variant_id = ${variantId}
      `
      const [variant] = await tx.sql`
        SELECT p.name, COALESCE(NULLIF(pv.price, 0), p.selling_price, 0) AS price
        FROM product_variants pv JOIN products p ON p.id = pv.product_id
        WHERE pv.id = ${variantId}
      `
      let available = stock - Number(reserved.qty)
      if (quantity > available && packs.length > 0) {
        const shortfall = quantity - Math.max(available, 0)
        for (const pack of packs) {
          const packRows = await tx.sql`
            SELECT quantity FROM stock
            WHERE depot_id = ${order.depot_id} AND product_variant_id = ${pack.id}
            FOR UPDATE
          `
          const packStock = packRows.reduce((s, r) => s + Number(r.quantity), 0)
          const packAvailable = packStock - (await reservedQty(tx, actor.companyId, order.depot_id, pack.id))
          const packsNeeded = Math.ceil(shortfall / pack.units_per_case)
          if (packAvailable < packsNeeded) continue

          if (autoUnpack === null) autoUnpack = await getPosAutoUnpack(actor.companyId)
          if (!options.unpack && !autoUnpack) {
            throw new AppError(
              409,
              `${variant.name} : ${Math.max(available, 0)} disponible(s) à l'unité. Ouvrir ${packsNeeded} × ${pack.label} ?`,
              'UNPACK_REQUIRED',
              {
                variantId,
                available: Math.max(available, 0),
                packVariantId: pack.id,
                packLabel: pack.label,
                packs: packsNeeded,
                unitsPerPack: pack.units_per_case,
              }
            )
          }
          const opened = await unpackStock(tx, {
            companyId: actor.companyId,
            depotId: order.depot_id,
            packVariantId: pack.id,
            packs: packsNeeded,
            userId: actor.userId,
            source: 'pos',
            posOrderId: orderId,
            notes: `Ouverture au point de vente (ticket ${order.ticket_number})`,
          })
          available += opened.units
          break
        }
      }
      if (quantity > available) {
        throw new AppError(
          409,
          available > 0
            ? `${variant.name} : plus que ${available} disponible(s)`
            : `${variant.name} : rupture de stock`,
          'INSUFFICIENT_STOCK',
          { variantId, available }
        )
      }

      const price = money(Number(variant.price))
      // Même produit, même prix, ajouté par la même personne il y a peu : on regroupe la ligne
      const [mergeable] = await tx.sql`
        SELECT id FROM pos_order_items
        WHERE pos_order_id = ${orderId} AND product_variant_id = ${variantId} AND status = 'active'
          AND unit_price = ${price} AND added_by = ${actor.userId}
          AND created_at > NOW() - (${CORRECTION_WINDOW_MS / 1000} * INTERVAL '1 second')
        ORDER BY created_at DESC LIMIT 1
      `
      if (mergeable) {
        await tx.sql`
          UPDATE pos_order_items SET quantity = quantity + ${quantity}, updated_at = NOW() WHERE id = ${mergeable.id}
        `
      } else {
        await tx.sql`
          INSERT INTO pos_order_items (pos_order_id, product_variant_id, quantity, unit_price, added_by)
          VALUES (${orderId}, ${variantId}, ${quantity}, ${price}, ${actor.userId})
        `
      }
    }
    await tx.sql`UPDATE pos_orders SET updated_at = NOW() WHERE id = ${orderId}`
  })
}

/**
 * Diminue la quantité d'une ligne (ou la retire si quantity = 0).
 * Correction libre dans les 5 minutes par la personne qui a saisi la ligne ;
 * au-delà, annulation tracée réservée au gérant, avec un motif.
 */
export async function reducePosItem(
  actor: PosActor,
  orderId: string,
  itemId: string,
  input: { quantity: number; reason?: string | null }
) {
  return withTransaction(async (tx) => {
    await lockOpenOrder(tx, actor.companyId, orderId)
    const [item] = await tx.sql`
      SELECT * FROM pos_order_items WHERE id = ${itemId} AND pos_order_id = ${orderId} FOR UPDATE
    `
    if (!item || item.status !== 'active') throw notFound('Article')
    if (input.quantity >= item.quantity) {
      throw new AppError(400, 'Utilisez l’ajout de produit pour augmenter la quantité', 'USE_ADD')
    }

    const isQuickCorrection =
      item.added_by === actor.userId && Date.now() - new Date(item.created_at).getTime() < CORRECTION_WINDOW_MS

    if (isQuickCorrection) {
      if (input.quantity === 0) {
        await tx.sql`DELETE FROM pos_order_items WHERE id = ${itemId}`
      } else {
        await tx.sql`UPDATE pos_order_items SET quantity = ${input.quantity}, updated_at = NOW() WHERE id = ${itemId}`
      }
      return { voided: false }
    }

    if (!actor.canManage) {
      throw new AppError(403, 'Article déjà servi : seul un gérant peut le retirer', 'MANAGER_REQUIRED')
    }
    const reason = input.reason?.trim()
    if (!reason) throw new AppError(400, 'Indiquez le motif du retrait', 'REASON_REQUIRED')

    const removed = item.quantity - input.quantity
    // Trace : la partie retirée devient une ligne annulée, le reste reste actif
    await tx.sql`
      INSERT INTO pos_order_items (
        pos_order_id, product_variant_id, quantity, unit_price, status, void_reason, voided_by, voided_at, added_by, created_at
      ) VALUES (
        ${orderId}, ${item.product_variant_id}, ${removed}, ${item.unit_price}, 'void', ${reason},
        ${actor.userId}, NOW(), ${item.added_by}, ${item.created_at}
      )
    `
    if (input.quantity === 0) {
      await tx.sql`DELETE FROM pos_order_items WHERE id = ${itemId}`
    } else {
      await tx.sql`UPDATE pos_order_items SET quantity = ${input.quantity}, updated_at = NOW() WHERE id = ${itemId}`
    }
    return { voided: true }
  })
}

export async function updatePosOrder(
  actor: PosActor,
  orderId: string,
  input: { tableId?: string | null; label?: string | null; clientId?: string | null; covers?: number | null; notes?: string | null }
) {
  return withTransaction(async (tx) => {
    const order = await lockOpenOrder(tx, actor.companyId, orderId)
    await assertOwned(tx.sql, actor.companyId, { clients: [input.clientId] })

    if (input.tableId !== undefined && input.tableId !== order.table_id) {
      if (input.tableId) {
        const [table] = await tx.sql`
          SELECT id FROM pos_tables WHERE id = ${input.tableId} AND company_id = ${actor.companyId} AND is_active = true
          FOR UPDATE
        `
        if (!table) throw notFound('Table')
        const [busy] = await tx.sql`SELECT ticket_number FROM pos_orders WHERE table_id = ${input.tableId} AND status = 'open'`
        if (busy) throw new AppError(409, `Cette table est déjà occupée (ticket ${busy.ticket_number})`, 'TABLE_BUSY')
      }
    }

    await tx.sql`
      UPDATE pos_orders SET
        table_id = ${input.tableId !== undefined ? input.tableId : order.table_id},
        order_type = ${input.tableId ? 'table' : input.tableId === null ? 'counter' : order.order_type},
        label = COALESCE(${input.label !== undefined ? input.label?.trim() || '' : null}, label),
        client_id = ${input.clientId !== undefined ? input.clientId : order.client_id},
        covers = COALESCE(${input.covers ?? null}, covers),
        notes = COALESCE(${input.notes ?? null}, notes),
        updated_at = NOW()
      WHERE id = ${orderId}
    `
  })
}

async function ensureWalkInClient(tx: Tx, companyId: string): Promise<string> {
  await tx.sql`
    INSERT INTO clients (company_id, name, client_type, is_walk_in)
    VALUES (${companyId}, 'Client comptoir', 'retail', true)
    ON CONFLICT (company_id) WHERE is_walk_in = true DO NOTHING
  `
  const [client] = await tx.sql`SELECT id FROM clients WHERE company_id = ${companyId} AND is_walk_in = true`
  return client.id
}

/** Encaisse le ticket : vente (stock, facture, caisse, créance) + clôture, atomiquement. */
export async function payPosOrder(
  actor: PosActor,
  orderId: string,
  input: {
    paymentMethod: 'cash' | 'mobile_money' | 'credit' | 'mixed'
    paidAmount: number
    cashAmount?: number
  }
) {
  return withTransaction(async (tx) => {
    const order = await lockOpenOrder(tx, actor.companyId, orderId)

    const items = await tx.sql`
      SELECT product_variant_id, SUM(quantity)::int AS quantity, unit_price::float AS unit_price
      FROM pos_order_items WHERE pos_order_id = ${orderId} AND status = 'active'
      GROUP BY product_variant_id, unit_price
    `
    if (items.length === 0) throw new AppError(400, 'Le ticket est vide', 'EMPTY_ORDER')

    const hasRealClient = Boolean(order.client_id)
    if ((input.paymentMethod === 'credit' || input.paymentMethod === 'mixed') && !hasRealClient) {
      throw new AppError(
        400,
        'Pour une ardoise ou un paiement partiel, rattachez d’abord un client au ticket',
        'CLIENT_REQUIRED'
      )
    }
    const clientId = order.client_id ?? (await ensureWalkInClient(tx, actor.companyId))

    const { order: sale, warnings } = await createSaleInTx(tx, {
      companyId: actor.companyId,
      userId: actor.userId,
      clientId,
      depotId: order.depot_id,
      orderSource: 'pos',
      paymentMethod: input.paymentMethod,
      paidAmount: input.paidAmount,
      cashAmount: input.cashAmount,
      notes: `Ticket ${order.ticket_number}`,
      items: items.map((i) => ({
        productVariantId: i.product_variant_id,
        quantity: i.quantity,
        unitPrice: i.unit_price,
      })),
    })

    // Une vente encaissée au comptoir est remise immédiatement
    await tx.sql`UPDATE sales_orders SET status = 'delivered' WHERE id = ${sale.id}`
    // Coût de revient figé sur les lignes du ticket (celui de la vente, CMP du dépôt)
    await tx.sql`
      UPDATE pos_order_items i SET unit_cost = c.unit_cost
      FROM (
        SELECT product_variant_id, SUM(quantity * unit_cost) / NULLIF(SUM(quantity), 0) AS unit_cost
        FROM sales_order_items WHERE sales_order_id = ${sale.id}
        GROUP BY product_variant_id
      ) c
      WHERE i.pos_order_id = ${orderId} AND i.status = 'active' AND i.product_variant_id = c.product_variant_id
    `
    await tx.sql`
      UPDATE pos_orders SET status = 'paid', sales_order_id = ${sale.id}, closed_by = ${actor.userId},
             closed_at = NOW(), updated_at = NOW()
      WHERE id = ${orderId}
    `
    return { saleId: sale.id as string, orderNumber: sale.order_number as string, warnings }
  })
}

export async function cancelPosOrder(actor: PosActor, orderId: string, reason: string) {
  return withTransaction(async (tx) => {
    const order = await lockOpenOrder(tx, actor.companyId, orderId)
    const [count] = await tx.sql`
      SELECT COUNT(*)::int AS n FROM pos_order_items WHERE pos_order_id = ${orderId} AND status = 'active'
    `
    // Un ticket vide peut être fermé par n'importe qui ; sinon gérant + motif
    if (count.n > 0) {
      if (!actor.canManage) throw new AppError(403, 'Seul un gérant peut annuler un ticket avec des articles', 'MANAGER_REQUIRED')
      if (!reason.trim()) throw new AppError(400, 'Indiquez le motif de l’annulation', 'REASON_REQUIRED')
    }
    await tx.sql`
      UPDATE pos_order_items SET status = 'void', void_reason = ${reason.trim() || 'Ticket annulé'},
             voided_by = ${actor.userId}, voided_at = NOW()
      WHERE pos_order_id = ${orderId} AND status = 'active'
    `
    await tx.sql`
      UPDATE pos_orders SET status = 'cancelled', cancel_reason = ${reason.trim() || null},
             closed_by = ${actor.userId}, closed_at = NOW(), updated_at = NOW()
      WHERE id = ${order.id}
    `
  })
}
