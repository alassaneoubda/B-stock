import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction, type Tx } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'
import { nextDocumentNumber } from '@/lib/sequences'
import { money } from '@/lib/domain/payments'

// GET /api/returns — List returns
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('returns.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const typeParam = searchParams.get('type')
    const returnType = typeParam === 'client' || typeParam === 'supplier' ? typeParam : null
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10) || 100, 1), 500)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

    const returns = await sql`
      SELECT r.*,
        c.name as client_name,
        s.name as supplier_name,
        so.order_number,
        d.name as depot_name,
        u.full_name as created_by_name,
        (SELECT COUNT(*) FROM return_items WHERE return_id = r.id) as items_count
      FROM returns r
      LEFT JOIN clients c ON r.client_id = c.id
      LEFT JOIN suppliers s ON r.supplier_id = s.id
      LEFT JOIN sales_orders so ON r.sales_order_id = so.id
      LEFT JOIN depots d ON r.depot_id = d.id
      LEFT JOIN users u ON r.created_by = u.id
      WHERE r.company_id = ${companyId}
        AND (${returnType}::text IS NULL OR r.return_type = ${returnType}::text)
      ORDER BY r.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    return NextResponse.json({ success: true, data: returns })
  } catch (error) {
    return handleRouteError(error, 'returns.list')
  }
}

const optionalUuid = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().uuid().optional()
)

const returnSchema = z.object({
  return_type: z.enum(['client', 'supplier']),
  client_id: optionalUuid,
  supplier_id: optionalUuid,
  sales_order_id: optionalUuid,
  /** Nom envoyé par l'écran « Nouveau retour » (alias de sales_order_id). */
  order_id: optionalUuid,
  purchase_order_id: optionalUuid,
  depot_id: z.string().uuid('Dépôt requis'),
  reason: z.string().max(2000).optional().nullable(),
  refund_method: z.enum(['credit_note', 'cash', 'replacement']).optional().default('credit_note'),
  notes: z.string().max(2000).optional().nullable(),
  items: z
    .array(
      z.object({
        item_type: z.enum(['product', 'packaging']).optional().default('product'),
        product_variant_id: optionalUuid,
        packaging_type_id: optionalUuid,
        quantity: z.coerce.number().int('Quantité entière requise').positive('Quantité invalide'),
        /** Ignoré : le prix est relu en base (vente d'origine, prix catalogue ou consigne). */
        unit_price: z.coerce.number().nonnegative().optional(),
        condition: z.enum(['good', 'damaged', 'expired']).optional().default('good'),
        notes: z.string().max(1000).optional().nullable(),
        reason: z.string().max(1000).optional().nullable(),
      })
    )
    .min(1, 'Au moins un article est requis')
    .max(200),
})

/**
 * L'écran « Nouveau retour » envoie l'id du PRODUIT dans product_variant_id.
 * Si l'id n'est pas une variante de l'entreprise mais un produit de
 * l'entreprise, on le résout vers la première variante de ce produit
 * (compatibilité temporaire, à retirer quand l'écran enverra une variante).
 */
async function resolveVariantIds(tx: Tx, companyId: string, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  const map = new Map<string, string>()
  if (unique.length === 0) return map
  const variants = await tx.sql`
    SELECT pv.id FROM product_variants pv JOIN products p ON p.id = pv.product_id
    WHERE p.company_id = ${companyId} AND pv.id = ANY(${unique}::uuid[])
  `
  for (const v of variants) map.set(v.id, v.id)
  const missing = unique.filter((id) => !map.has(id))
  if (missing.length > 0) {
    const firstVariants = await tx.sql`
      SELECT DISTINCT ON (p.id) p.id AS product_id, pv.id AS variant_id
      FROM products p JOIN product_variants pv ON pv.product_id = p.id
      WHERE p.company_id = ${companyId} AND p.id = ANY(${missing}::uuid[])
      ORDER BY p.id, pv.created_at ASC, pv.id ASC
    `
    for (const r of firstVariants) map.set(r.product_id, r.variant_id)
  }
  if (map.size !== unique.length) throw new AppError(404, 'Produit introuvable', 'NOT_FOUND')
  return map
}

// POST /api/returns — Create a return (pending; stock and accounts change on processing)
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('returns.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const data = returnSchema.parse(await request.json())
    const isClient = data.return_type === 'client'
    const salesOrderId = isClient ? (data.sales_order_id ?? data.order_id ?? null) : null
    const purchaseOrderId = isClient ? null : (data.purchase_order_id ?? null)
    let clientId = isClient ? (data.client_id ?? null) : null
    const supplierId = isClient ? null : (data.supplier_id ?? null)

    for (const item of data.items) {
      if (item.item_type === 'product' && !item.product_variant_id) {
        throw new AppError(400, 'Produit manquant sur une ligne du retour', 'BAD_REQUEST')
      }
      if (item.item_type === 'packaging' && !item.packaging_type_id) {
        throw new AppError(400, "Type d'emballage manquant sur une ligne du retour", 'BAD_REQUEST')
      }
    }
    if (!isClient && !supplierId) throw new AppError(400, 'Fournisseur requis', 'BAD_REQUEST')

    const created = await withTransaction(async (tx) => {
      await assertOwned(tx.sql, companyId, {
        depots: [data.depot_id],
        clients: [clientId],
        suppliers: [supplierId],
        salesOrders: [salesOrderId],
        purchaseOrders: [purchaseOrderId],
        packagingTypes: data.items.map((i) => (i.item_type === 'packaging' ? i.packaging_type_id : null)),
      })

      // Vente d'origine verrouillée : deux retours simultanés ne peuvent pas
      // dépasser ensemble la quantité vendue.
      let order: any = null
      if (salesOrderId) {
        ;[order] = await tx.sql`
          SELECT id, client_id, status FROM sales_orders WHERE id = ${salesOrderId} FOR UPDATE
        `
        if (order.status === 'cancelled') {
          throw new AppError(409, 'Cette vente est annulée : aucun retour possible', 'ORDER_CANCELLED')
        }
        if (clientId && order.client_id !== clientId) {
          throw new AppError(400, "Cette vente n'appartient pas à ce client", 'ORDER_CLIENT_MISMATCH')
        }
        clientId = clientId ?? order.client_id
      }
      if (isClient && !clientId) throw new AppError(400, 'Client requis', 'BAD_REQUEST')

      const variantMap = await resolveVariantIds(
        tx,
        companyId,
        data.items.filter((i) => i.item_type === 'product').map((i) => i.product_variant_id!)
      )

      // Prix unitaires relus en base
      const variantIds = [...new Set(variantMap.values())]
      const variantPrices = new Map<string, number>()
      if (variantIds.length > 0) {
        const rows = await tx.sql`
          SELECT id, price, cost_price FROM product_variants WHERE id = ANY(${variantIds}::uuid[])
        `
        for (const r of rows) {
          variantPrices.set(r.id, Number(isClient ? r.price : (r.cost_price ?? r.price)) || 0)
        }
      }
      const packagingIds = [
        ...new Set(data.items.filter((i) => i.item_type === 'packaging').map((i) => i.packaging_type_id!)),
      ]
      const packagingPrices = new Map<string, number>()
      if (packagingIds.length > 0) {
        const rows = await tx.sql`
          SELECT id, deposit_price FROM packaging_types WHERE id = ANY(${packagingIds}::uuid[])
        `
        for (const r of rows) packagingPrices.set(r.id, Number(r.deposit_price) || 0)
      }

      // Quantités : pas plus que vendu (moins déjà retourné) sur la vente d'origine
      const orderPrices = new Map<string, number>()
      if (order) {
        const requested = new Map<string, number>()
        for (const i of data.items) {
          if (i.item_type !== 'product') continue
          const v = variantMap.get(i.product_variant_id!)!
          requested.set(v, (requested.get(v) ?? 0) + i.quantity)
        }
        const sold = await tx.sql`
          SELECT soi.product_variant_id,
                 SUM(soi.quantity)::int AS sold,
                 SUM(COALESCE(soi.total_price, soi.quantity * soi.unit_price)) AS sold_value,
                 COALESCE((
                   SELECT SUM(ri.quantity) FROM return_items ri
                   JOIN returns r ON r.id = ri.return_id
                   WHERE r.sales_order_id = ${order.id} AND r.company_id = ${companyId}
                     AND r.status <> 'rejected' AND ri.item_type = 'product'
                     AND ri.product_variant_id = soi.product_variant_id
                 ), 0)::int
                 + COALESCE((
                   SELECT SUM(sm.quantity) FROM stock_movements sm
                   WHERE sm.company_id = ${companyId} AND sm.movement_type = 'return'
                     AND sm.reference_type = 'sales_order' AND sm.reference_id = ${order.id}
                     AND sm.product_variant_id = soi.product_variant_id
                 ), 0)::int AS returned
          FROM sales_order_items soi
          WHERE soi.sales_order_id = ${order.id}
          GROUP BY soi.product_variant_id
        `
        const soldMap = new Map(sold.map((s) => [s.product_variant_id as string, s]))
        for (const [variantId, qty] of requested) {
          const s = soldMap.get(variantId)
          const available = s ? Number(s.sold) - Number(s.returned) : 0
          if (qty > available) {
            throw new AppError(
              409,
              `Quantité retournée supérieure à la quantité vendue restante sur cette vente (${Math.max(available, 0)} au maximum)`,
              'RETURN_EXCEEDS_SOLD',
              { variantId, available: Math.max(available, 0), requested: qty }
            )
          }
          if (s && Number(s.sold) > 0) orderPrices.set(variantId, Number(s.sold_value) / Number(s.sold))
        }
      }

      const lines = data.items.map((i) => {
        if (i.item_type === 'product') {
          const variantId = variantMap.get(i.product_variant_id!)!
          const unitPrice = money(orderPrices.get(variantId) ?? variantPrices.get(variantId) ?? 0)
          return { ...i, product_variant_id: variantId, packaging_type_id: null, unitPrice, total: money(unitPrice * i.quantity) }
        }
        const unitPrice = money(packagingPrices.get(i.packaging_type_id!) ?? 0)
        return { ...i, product_variant_id: null, unitPrice, total: money(unitPrice * i.quantity) }
      })
      const totalAmount = money(lines.reduce((s, l) => s + l.total, 0))

      const returnNumber = await nextDocumentNumber(tx, companyId, 'return')
      const [ret] = await tx.sql`
        INSERT INTO returns (
          company_id, return_number, return_type, client_id, supplier_id, sales_order_id,
          purchase_order_id, depot_id, reason, total_amount, refund_method, notes, created_by
        )
        VALUES (
          ${companyId}, ${returnNumber}, ${data.return_type}, ${clientId}, ${supplierId}, ${salesOrderId},
          ${purchaseOrderId}, ${data.depot_id}, ${data.reason || null}, ${totalAmount},
          ${data.refund_method}, ${data.notes || null}, ${userId}
        )
        RETURNING *
      `

      for (const l of lines) {
        await tx.sql`
          INSERT INTO return_items (
            return_id, product_variant_id, packaging_type_id, item_type, quantity,
            unit_price, total_price, condition, notes
          )
          VALUES (
            ${ret.id}, ${l.product_variant_id}, ${l.packaging_type_id ?? null}, ${l.item_type}, ${l.quantity},
            ${l.unitPrice}, ${l.total}, ${l.condition}, ${l.notes || l.reason || null}
          )
        `
      }

      await tx.sql`
        INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
        VALUES (${companyId}, ${userId}, 'create', 'return', ${ret.id},
          ${JSON.stringify({ return_type: data.return_type, total_amount: totalAmount })}::jsonb)
      `
      return ret
    })

    return NextResponse.json({ success: true, data: created })
  } catch (error) {
    return handleRouteError(error, 'returns.create')
  }
}
