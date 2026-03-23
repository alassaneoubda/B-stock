import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

const salesOrderSchema = z.object({
  clientId: z.string().uuid(),
  depotId: z.string().uuid(),
  orderSource: z.string().optional(),
  paymentMethod: z.enum(['cash', 'mobile_money', 'credit', 'mixed']),
  paidAmount: z.number().min(0).default(0),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      productVariantId: z.string().uuid(),
      quantity: z.number().int().positive(),
      unitPrice: z.number().min(0),
      lotNumber: z.string().optional(),
    })
  ).min(1),
  packagingItems: z.array(
    z.object({
      packagingTypeId: z.string().uuid(),
      quantityOut: z.number().int().min(0).default(0),
      quantityIn: z.number().int().min(0).default(0),
      unitPrice: z.number().min(0).default(0),
    })
  ).optional(),
})

function generateOrderNumber(): string {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `VNT-${dateStr}-${rand}`
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(amount)
}

// POST /api/sales — Create a new sales order
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = await request.json()
    const data = salesOrderSchema.parse(body)
    const { companyId } = session.user

    // 1. Verify client belongs to company
    const clients = await sql`
      SELECT id, name, credit_limit, packaging_credit_limit FROM clients
      WHERE id = ${data.clientId} AND company_id = ${companyId} AND is_active = true
    `
    if (clients.length === 0) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    }

    // 2. If credit payment, check product credit limit
    if (data.paymentMethod === 'credit') {
      const productAccounts = await sql`
        SELECT COALESCE(SUM(balance), 0) as current_debt
        FROM client_accounts
        WHERE client_id = ${data.clientId} AND account_type = 'product'
      `
      const currentProductDebt = Math.abs(Number(productAccounts[0]?.current_debt || 0))
      const productCreditLimit = Number(clients[0].credit_limit)

      const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
      const newProductDebt = subtotal - data.paidAmount

      if (productCreditLimit > 0 && currentProductDebt + newProductDebt > productCreditLimit) {
        return NextResponse.json({
          error: `Plafond de crédit produits dépassé. Crédit actuel: ${formatCurrency(currentProductDebt)}, Limite: ${formatCurrency(productCreditLimit)}`,
        }, { status: 400 })
      }

      // Check packaging credit limit
      const packagingCreditLimit = Number(clients[0].packaging_credit_limit)
      if (packagingCreditLimit > 0 && data.packagingItems && data.packagingItems.length > 0) {
        const packagingAccounts = await sql`
          SELECT COALESCE(SUM(balance), 0) as current_debt
          FROM client_accounts
          WHERE client_id = ${data.clientId} AND account_type = 'packaging'
        `
        const currentPackagingDebt = Math.abs(Number(packagingAccounts[0]?.current_debt || 0))
        const newPackagingDebt = data.packagingItems.reduce(
          (sum, item) => sum + (item.quantityOut - item.quantityIn) * item.unitPrice, 0
        )

        if (currentPackagingDebt + newPackagingDebt > packagingCreditLimit) {
          return NextResponse.json({
            error: `Plafond de crédit emballages dépassé. Crédit actuel: ${formatCurrency(currentPackagingDebt)}, Limite: ${formatCurrency(packagingCreditLimit)}`,
          }, { status: 400 })
        }
      }
    }

    // 3. Calculate totals
    const subtotal = data.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    )
    const packagingTotal = (data.packagingItems || []).reduce(
      (sum, item) => sum + (item.quantityOut - item.quantityIn) * item.unitPrice,
      0
    )
    const totalAmount = subtotal + packagingTotal

    // 4. Generate order number
    const orderNumber = generateOrderNumber()

    // 5. Allocate payment: products first, then packaging
    const paidForProducts = Math.min(subtotal, data.paidAmount)
    const paidForPackaging = Math.min(packagingTotal, Math.max(0, data.paidAmount - subtotal))

    // 6. Create sales order
    const orders = await sql`
      INSERT INTO sales_orders (
        company_id, client_id, depot_id, order_number, status,
        order_source, subtotal, packaging_total, total_amount,
        paid_amount, paid_amount_products, paid_amount_packaging,
        payment_method, notes, created_by
      ) VALUES (
        ${companyId}, ${data.clientId}, ${data.depotId}, ${orderNumber},
        'confirmed', ${data.orderSource || 'in_person'}, ${subtotal},
        ${packagingTotal}, ${totalAmount}, ${data.paidAmount},
        ${paidForProducts}, ${paidForPackaging},
        ${data.paymentMethod}, ${data.notes || null}, ${session.user.id}
      )
      RETURNING *
    `
    const order = orders[0]

    // 7. Create order items + deduct stock
    for (const item of data.items) {
      // Insert order item
      await sql`
        INSERT INTO sales_order_items (
          sales_order_id, product_variant_id, quantity,
          unit_price, total_price, lot_number
        ) VALUES (
          ${order.id}, ${item.productVariantId}, ${item.quantity},
          ${item.unitPrice}, ${item.quantity * item.unitPrice},
          ${item.lotNumber || null}
        )
      `

      // Deduct stock
      await sql`
        UPDATE stock
        SET quantity = quantity - ${item.quantity}, updated_at = NOW()
        WHERE depot_id = ${data.depotId}
          AND product_variant_id = ${item.productVariantId}
          AND quantity >= ${item.quantity}
      `

      // Record stock movement
      await sql`
        INSERT INTO stock_movements (
          company_id, depot_id, product_variant_id,
          movement_type, quantity, reference_type, reference_id,
          lot_number, created_by
        ) VALUES (
          ${companyId}, ${data.depotId}, ${item.productVariantId},
          'sale', ${-item.quantity}, 'sales_order', ${order.id},
          ${item.lotNumber || null}, ${session.user.id}
        )
      `
    }

    // 8. Handle packaging items
    if (data.packagingItems && data.packagingItems.length > 0) {
      for (const pkg of data.packagingItems) {
        // Insert into sales_order_packaging_items
        await sql`
          INSERT INTO sales_order_packaging_items (
            sales_order_id, packaging_type_id,
            quantity_out, quantity_in, unit_price
          ) VALUES (
            ${order.id}, ${pkg.packagingTypeId},
            ${pkg.quantityOut}, ${pkg.quantityIn}, ${pkg.unitPrice}
          )
        `

        // Log packaging transaction
        const netOut = pkg.quantityOut - pkg.quantityIn
        if (netOut !== 0) {
          await sql`
            INSERT INTO packaging_transactions (
              company_id, client_id, sales_order_id,
              packaging_type_id, transaction_type, quantity,
              unit_price, total_amount, created_by
            ) VALUES (
              ${companyId}, ${data.clientId}, ${order.id},
              ${pkg.packagingTypeId},
              ${netOut > 0 ? 'given' : 'returned'},
              ${Math.abs(netOut)},
              ${pkg.unitPrice},
              ${Math.abs(netOut) * pkg.unitPrice},
              ${session.user.id}
            )
          `
        }

        // Update packaging stock
        if (pkg.quantityOut > 0) {
          await sql`
            UPDATE packaging_stock
            SET quantity = quantity - ${pkg.quantityOut}, updated_at = NOW()
            WHERE depot_id = ${data.depotId}
              AND packaging_type_id = ${pkg.packagingTypeId}
          `
        }
        if (pkg.quantityIn > 0) {
          await sql`
            UPDATE packaging_stock
            SET quantity = quantity + ${pkg.quantityIn}, updated_at = NOW()
            WHERE depot_id = ${data.depotId}
              AND packaging_type_id = ${pkg.packagingTypeId}
          `
        }
      }
    }

    // 9. Update client accounts (debt = amount owed minus what was paid)
    const productDebtChange = subtotal - paidForProducts
    const packagingDebtChange = packagingTotal - paidForPackaging

    // Update product account (negative balance = client owes money)
    if (productDebtChange !== 0) {
      await sql`
        UPDATE client_accounts
        SET balance = balance - ${productDebtChange},
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE client_id = ${data.clientId} AND account_type = 'product'
      `
    }

    // Update packaging account
    if (packagingDebtChange !== 0) {
      await sql`
        UPDATE client_accounts
        SET balance = balance - ${packagingDebtChange},
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE client_id = ${data.clientId} AND account_type = 'packaging'
      `
    }

    // 10. Record payment(s) — separate records for product and packaging portions
    if (paidForProducts > 0) {
      await sql`
        INSERT INTO payments (
          company_id, client_id, sales_order_id,
          amount, payment_method, payment_type, status, received_by
        ) VALUES (
          ${companyId}, ${data.clientId}, ${order.id},
          ${paidForProducts}, ${data.paymentMethod}, 'product',
          'completed', ${session.user.id}
        )
      `
    }
    if (paidForPackaging > 0) {
      await sql`
        INSERT INTO payments (
          company_id, client_id, sales_order_id,
          amount, payment_method, payment_type, status, received_by
        ) VALUES (
          ${companyId}, ${data.clientId}, ${order.id},
          ${paidForPackaging}, ${data.paymentMethod}, 'packaging',
          'completed', ${session.user.id}
        )
      `
    }

    // 11. Auto-generate invoice for this sale
    try {
      const invPrefix = 'FC'
      const invDate = new Date()
      const invY = invDate.getFullYear().toString().slice(-2)
      const invM = (invDate.getMonth() + 1).toString().padStart(2, '0')
      const invRand = Math.random().toString(36).substring(2, 6).toUpperCase()
      const invoiceNumber = `${invPrefix}-${invY}${invM}-${invRand}`
      const invPaid = Number(data.paidAmount)
      const invRemaining = totalAmount - invPaid
      const invStatus = invPaid >= totalAmount ? 'paid' : invPaid > 0 ? 'partial' : 'draft'

      const invResult = await sql`
        INSERT INTO invoices (
          invoice_number, type, company_id, client_id,
          order_id, total_ht, total_ttc, total_amount,
          amount_paid, remaining_amount, status
        ) VALUES (
          ${invoiceNumber}, 'client', ${companyId}, ${data.clientId},
          ${order.id}, ${totalAmount}, ${totalAmount}, ${totalAmount},
          ${invPaid}, ${invRemaining}, ${invStatus}
        )
        RETURNING id
      `

      if (invResult[0]?.id) {
        for (const item of data.items) {
          const lineTotal = item.quantity * item.unitPrice
          await sql`
            INSERT INTO invoice_items (
              invoice_id, product_id, description,
              quantity, unit_price, total_price, item_type
            ) VALUES (
              ${invResult[0].id}, ${item.productVariantId}, ${'Produit'},
              ${item.quantity}, ${item.unitPrice}, ${lineTotal}, 'product'
            )
          `
        }
      }
    } catch (invError) {
      console.error('Error auto-generating invoice (non-blocking):', invError)
    }

    return NextResponse.json({
      success: true,
      data: order,
      message: 'Vente créée avec succès',
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      )
    }
    console.error('Error creating sale:', error)
    return NextResponse.json({ error: 'Erreur lors de la création de la vente' }, { status: 500 })
  }
}

// GET /api/sales — List sales orders
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const clientId = searchParams.get('clientId')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    let orders
    if (status && clientId) {
      orders = await sql`
        SELECT so.*, c.name as client_name
        FROM sales_orders so
        LEFT JOIN clients c ON so.client_id = c.id
        WHERE so.company_id = ${session.user.companyId}
          AND so.status = ${status}
          AND so.client_id = ${clientId}
        ORDER BY so.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else if (status) {
      orders = await sql`
        SELECT so.*, c.name as client_name
        FROM sales_orders so
        LEFT JOIN clients c ON so.client_id = c.id
        WHERE so.company_id = ${session.user.companyId}
          AND so.status = ${status}
        ORDER BY so.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else if (clientId) {
      orders = await sql`
        SELECT so.*, c.name as client_name
        FROM sales_orders so
        LEFT JOIN clients c ON so.client_id = c.id
        WHERE so.company_id = ${session.user.companyId}
          AND so.client_id = ${clientId}
        ORDER BY so.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else {
      orders = await sql`
        SELECT so.*, c.name as client_name
        FROM sales_orders so
        LEFT JOIN clients c ON so.client_id = c.id
        WHERE so.company_id = ${session.user.companyId}
        ORDER BY so.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    }

    return NextResponse.json({ success: true, data: orders })
  } catch (error) {
    console.error('Error fetching sales:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération des ventes' }, { status: 500 })
  }
}
