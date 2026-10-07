import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { AppError, badRequest, handleRouteError, notFound } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'
import { nextDocumentNumber } from '@/lib/sequences'
import { addStock } from '@/lib/domain/stock'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Date optionnelle « AAAA-MM-JJ » ; la chaîne vide (champ non rempli) vaut null. */
const optionalDate = z
  .union([z.literal(''), z.string().regex(DATE_RE, 'Date invalide (AAAA-MM-JJ)')])
  .nullable()
  .optional()
  .transform((v) => v || null)

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null)

const purchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  depotId: z.string().uuid(),
  expectedDeliveryAt: optionalDate,
  notes: optionalText(2000),
  items: z
    .array(
      z.object({
        productVariantId: z.string().uuid(),
        quantityOrdered: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
        lotNumber: optionalText(100),
        expiryDate: optionalDate,
      })
    )
    .min(1, 'Au moins un article est requis'),
})

const receiveSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantityReceived: z.number().int().nonnegative(),
        quantityDamaged: z.number().int().nonnegative().default(0),
        lotNumber: optionalText(100),
        expiryDate: optionalDate,
      })
    )
    .min(1, 'Au moins une ligne est requise'),
})

/** Statuts à partir desquels une réception est possible. */
const RECEIVABLE_STATUSES = ['pending', 'confirmed', 'partial']

type PoItemRow = {
  id: string
  product_variant_id: string
  quantity_ordered: number
  unit_price: string | null
  quantity_received: number
  quantity_damaged: number
  lot_number: string | null
  expiry_date: string | null
}

async function receivePurchaseOrder(
  body: unknown,
  companyId: string,
  userId: string
) {
  const data = receiveSchema.parse(body)

  const ids = data.items.map((i) => i.itemId)
  if (new Set(ids).size !== ids.length) {
    throw badRequest('Une même ligne de commande apparaît plusieurs fois')
  }
  if (data.items.every((i) => i.quantityReceived + i.quantityDamaged === 0)) {
    throw badRequest('Aucune quantité à réceptionner')
  }

  return withTransaction(async (tx) => {
    // Verrou sur le bon de commande : deux réceptions simultanées sont sérialisées.
    const [po] = await tx.sql<{ id: string; depot_id: string; status: string; order_number: string }>`
      SELECT id, depot_id, status, order_number FROM purchase_orders
      WHERE id = ${data.purchaseOrderId} AND company_id = ${companyId}
      FOR UPDATE
    `
    if (!po) throw notFound('Commande')
    if (!RECEIVABLE_STATUSES.includes(po.status)) {
      throw new AppError(
        409,
        po.status === 'received'
          ? 'Cette commande a déjà été entièrement réceptionnée'
          : 'Cette commande ne peut pas être réceptionnée dans son état actuel',
        'INVALID_STATUS'
      )
    }

    const poItems = await tx.sql<PoItemRow>`
      SELECT id, product_variant_id, quantity_ordered, unit_price,
        COALESCE(quantity_received, 0)::int AS quantity_received,
        COALESCE(quantity_damaged, 0)::int AS quantity_damaged,
        lot_number, expiry_date::text AS expiry_date
      FROM purchase_order_items
      WHERE purchase_order_id = ${po.id}
      FOR UPDATE
    `
    const byId = new Map(poItems.map((i) => [i.id, i]))

    for (const item of data.items) {
      const poItem = byId.get(item.itemId)
      if (!poItem) throw notFound('Ligne de commande')

      const processed = item.quantityReceived + item.quantityDamaged
      if (processed === 0) continue

      const remaining =
        Number(poItem.quantity_ordered) - Number(poItem.quantity_received) - Number(poItem.quantity_damaged)
      if (processed > remaining) {
        throw new AppError(
          409,
          `Quantité reçue + casse (${processed}) supérieure au reste à réceptionner (${Math.max(remaining, 0)})`,
          'OVER_RECEPTION'
        )
      }

      const lotNumber = item.lotNumber ?? poItem.lot_number ?? null
      const expiryDate = item.expiryDate ?? poItem.expiry_date ?? null

      await tx.sql`
        UPDATE purchase_order_items SET
          quantity_received = COALESCE(quantity_received, 0) + ${item.quantityReceived},
          quantity_damaged = COALESCE(quantity_damaged, 0) + ${item.quantityDamaged},
          lot_number = COALESCE(${lotNumber}::text, lot_number),
          expiry_date = COALESCE(${expiryDate}::date, expiry_date),
          updated_at = NOW()
        WHERE id = ${poItem.id}
      `

      // Seules les unités en bon état entrent en stock ; la casse est juste tracée sur la ligne.
      // Entrée valorisée au prix d'achat de la ligne : recalcule le CMP du dépôt.
      if (item.quantityReceived > 0) {
        await addStock(tx, {
          companyId,
          depotId: po.depot_id,
          variantId: poItem.product_variant_id,
          quantity: item.quantityReceived,
          unitCost: poItem.unit_price == null ? null : Number(poItem.unit_price),
          lotNumber,
          expiryDate,
          movementType: 'purchase',
          referenceType: 'purchase_order',
          referenceId: po.id,
          userId,
        })
      }
    }

    const [{ complete }] = await tx.sql<{ complete: boolean }>`
      SELECT COALESCE(bool_and(
        COALESCE(quantity_received, 0) + COALESCE(quantity_damaged, 0) >= quantity_ordered
      ), true) AS complete
      FROM purchase_order_items
      WHERE purchase_order_id = ${po.id}
    `
    const status = complete ? 'received' : 'partial'

    await tx.sql`
      UPDATE purchase_orders SET
        status = ${status},
        received_at = CASE WHEN ${complete}::boolean THEN NOW() ELSE received_at END,
        updated_at = NOW()
      WHERE id = ${po.id}
    `

    return { status }
  })
}

async function createPurchaseOrder(body: unknown, companyId: string, userId: string) {
  const data = purchaseOrderSchema.parse(body)

  const totalAmount = data.items.reduce(
    (sum, item) => sum + item.quantityOrdered * item.unitPrice,
    0
  )

  return withTransaction(async (tx) => {
    await assertOwned(tx.sql, companyId, {
      suppliers: [data.supplierId],
      depots: [data.depotId],
      variants: data.items.map((i) => i.productVariantId),
    })

    const orderNumber = await nextDocumentNumber(tx, companyId, 'purchase')

    const [order] = await tx.sql`
      INSERT INTO purchase_orders (
        company_id, supplier_id, depot_id, order_number,
        status, total_amount, notes, expected_delivery_at, created_by
      ) VALUES (
        ${companyId}, ${data.supplierId}, ${data.depotId},
        ${orderNumber}, 'pending', ${totalAmount},
        ${data.notes}, ${data.expectedDeliveryAt},
        ${userId}
      )
      RETURNING *
    `

    for (const item of data.items) {
      await tx.sql`
        INSERT INTO purchase_order_items (
          purchase_order_id, product_variant_id, quantity_ordered,
          unit_price, lot_number, expiry_date
        ) VALUES (
          ${order.id}, ${item.productVariantId}, ${item.quantityOrdered},
          ${item.unitPrice}, ${item.lotNumber}, ${item.expiryDate}
        )
      `
    }

    return order
  })
}

// POST /api/procurement — création d'une commande, ou réception si `purchaseOrderId` est fourni
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('purchases.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const body = await request.json()

    if (body && typeof body === 'object' && 'purchaseOrderId' in body && body.purchaseOrderId) {
      const result = await receivePurchaseOrder(body, companyId, userId)
      return NextResponse.json({
        success: true,
        data: result,
        message:
          result.status === 'received'
            ? 'Réception enregistrée avec succès'
            : 'Réception partielle enregistrée',
      })
    }

    const order = await createPurchaseOrder(body, companyId, userId)
    return NextResponse.json(
      { success: true, data: order, message: "Commande d'achat créée avec succès" },
      { status: 201 }
    )
  } catch (error) {
    return handleRouteError(error, 'procurement.post')
  }
}

const listSchema = z.object({
  status: z.string().regex(/^[a-z_]{1,30}$/, 'Statut invalide').optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

// GET /api/procurement — List purchase orders
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('purchases.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const q = listSchema.parse({
      status: searchParams.get('status') || undefined,
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
    })
    const status = q.status ?? null

    const orders = await sql`
      SELECT po.*, s.name as supplier_name, d.name as depot_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN depots d ON po.depot_id = d.id
      WHERE po.company_id = ${companyId}
        AND (${status}::text IS NULL OR po.status = ${status}::text)
      ORDER BY po.created_at DESC, po.id DESC
      LIMIT ${q.limit} OFFSET ${q.offset}
    `

    return NextResponse.json({ success: true, data: orders })
  } catch (error) {
    return handleRouteError(error, 'procurement.list')
  }
}
