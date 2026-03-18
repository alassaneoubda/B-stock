import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

const purchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  depotId: z.string().uuid(),
  expectedDeliveryAt: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      productVariantId: z.string().uuid(),
      quantityOrdered: z.number().int().positive(),
      unitPrice: z.number().min(0),
      lotNumber: z.string().optional(),
      expiryDate: z.string().optional(),
    })
  ).min(1),
})

const receiveSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  items: z.array(
    z.object({
      itemId: z.string().uuid(),
      quantityReceived: z.number().int().min(0),
      quantityDamaged: z.number().int().min(0).default(0),
      lotNumber: z.string().optional(),
      expiryDate: z.string().optional(),
    })
  ),
})

function generatePONumber(): string {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `ACH-${dateStr}-${rand}`
}

// POST /api/procurement
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = await request.json()
    const { companyId } = session.user

    // Check if this is a "receive" action or "create order"
    if (body.purchaseOrderId) {
      // Receiving goods
      const data = receiveSchema.parse(body)

      // Verify purchase order
      const orders = await sql`
        SELECT * FROM purchase_orders
        WHERE id = ${data.purchaseOrderId} AND company_id = ${companyId}
      `
      if (orders.length === 0) {
        return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
      }
      const po = orders[0] as { id: string; depot_id: string }

      for (const item of data.items) {
        // Update purchase order item
        await sql`
          UPDATE purchase_order_items
          SET quantity_received = ${item.quantityReceived},
              quantity_damaged = ${item.quantityDamaged},
              lot_number = COALESCE(${item.lotNumber || null}, lot_number),
              expiry_date = COALESCE(${item.expiryDate || null}, expiry_date),
              updated_at = NOW()
          WHERE id = ${item.itemId}
            AND purchase_order_id = ${data.purchaseOrderId}
        `

        // Get the product_variant_id for this item
        const poItems = await sql`
          SELECT product_variant_id FROM purchase_order_items WHERE id = ${item.itemId}
        `
        const productVariantId = poItems[0]?.product_variant_id

        if (productVariantId && item.quantityReceived > 0) {
          // Upsert stock
          const existingStock = await sql`
            SELECT id FROM stock
            WHERE depot_id = ${po.depot_id}
              AND product_variant_id = ${productVariantId}
              AND lot_number = ${item.lotNumber || null}
          `

          if (existingStock.length > 0) {
            await sql`
              UPDATE stock
              SET quantity = quantity + ${item.quantityReceived},
                  expiry_date = COALESCE(${item.expiryDate || null}, expiry_date),
                  updated_at = NOW()
              WHERE id = ${existingStock[0].id}
            `
          } else {
            await sql`
              INSERT INTO stock (depot_id, product_variant_id, lot_number, quantity, expiry_date)
              VALUES (${po.depot_id}, ${productVariantId}, ${item.lotNumber || null},
                      ${item.quantityReceived}, ${item.expiryDate || null})
            `
          }

          // Record stock movement
          await sql`
            INSERT INTO stock_movements (
              company_id, depot_id, product_variant_id,
              movement_type, quantity, reference_type, reference_id,
              lot_number, created_by
            ) VALUES (
              ${companyId}, ${po.depot_id}, ${productVariantId},
              'purchase', ${item.quantityReceived}, 'purchase_order',
              ${data.purchaseOrderId}, ${item.lotNumber || null},
              ${session.user.id}
            )
          `

          // Record damaged if any
          if (item.quantityDamaged > 0) {
            await sql`
              INSERT INTO stock_movements (
                company_id, depot_id, product_variant_id,
                movement_type, quantity, reference_type, reference_id,
                notes, created_by
              ) VALUES (
                ${companyId}, ${po.depot_id}, ${productVariantId},
                'damage', ${-item.quantityDamaged}, 'purchase_order',
                ${data.purchaseOrderId}, 'Casse à la réception',
                ${session.user.id}
              )
            `
          }
        }
      }

      // Update purchase order status
      await sql`
        UPDATE purchase_orders
        SET status = 'received', received_at = NOW(), updated_at = NOW()
        WHERE id = ${data.purchaseOrderId}
      `

      return NextResponse.json({
        success: true,
        message: 'Réception enregistrée avec succès',
      })
    } else {
      // Creating a new purchase order
      const data = purchaseOrderSchema.parse(body)
      const orderNumber = generatePONumber()

      const totalAmount = data.items.reduce(
        (sum, item) => sum + item.quantityOrdered * item.unitPrice,
        0
      )

      const orders = await sql`
        INSERT INTO purchase_orders (
          company_id, supplier_id, depot_id, order_number,
          status, total_amount, notes, expected_delivery_at, created_by
        ) VALUES (
          ${companyId}, ${data.supplierId}, ${data.depotId},
          ${orderNumber}, 'pending', ${totalAmount},
          ${data.notes || null}, ${data.expectedDeliveryAt || null},
          ${session.user.id}
        )
        RETURNING *
      `

      for (const item of data.items) {
        await sql`
          INSERT INTO purchase_order_items (
            purchase_order_id, product_variant_id, quantity_ordered,
            unit_price, lot_number, expiry_date
          ) VALUES (
            ${orders[0].id}, ${item.productVariantId}, ${item.quantityOrdered},
            ${item.unitPrice}, ${item.lotNumber || null}, ${item.expiryDate || null}
          )
        `
      }

      return NextResponse.json({
        success: true,
        data: orders[0],
        message: 'Commande d\'achat créée avec succès',
      }, { status: 201 })
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      )
    }
    console.error('Error in procurement:', error)
    return NextResponse.json(
      { error: 'Erreur lors du traitement de la commande' },
      { status: 500 }
    )
  }
}

// GET /api/procurement — List purchase orders
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let orders
    if (status) {
      orders = await sql`
        SELECT po.*, s.name as supplier_name, d.name as depot_name
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN depots d ON po.depot_id = d.id
        WHERE po.company_id = ${session.user.companyId}
          AND po.status = ${status}
        ORDER BY po.created_at DESC
      `
    } else {
      orders = await sql`
        SELECT po.*, s.name as supplier_name, d.name as depot_name
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN depots d ON po.depot_id = d.id
        WHERE po.company_id = ${session.user.companyId}
        ORDER BY po.created_at DESC
      `
    }

    return NextResponse.json({ success: true, data: orders })
  } catch (error) {
    console.error('Error fetching procurement:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des commandes' },
      { status: 500 }
    )
  }
}
