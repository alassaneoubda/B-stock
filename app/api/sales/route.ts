import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, sqlRaw, transaction } from '@/lib/db'
import { createCashMovementFromSale, hasExistingCashMovement } from '@/lib/cash-automation'

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
    const authz = await requirePermission('sales.write')
    if (!authz.ok) return authz.response
    const { session, companyId } = authz

    const body = await request.json()
    const data = salesOrderSchema.parse(body)

    // 1. Verify client belongs to company
    const clients = await sql`
      SELECT id, name, credit_limit, packaging_credit_limit, payment_terms_days FROM clients
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

    // 4. Generate order number + id (id pré-généré pour l'atomicité, pas de RETURNING)
    const orderNumber = generateOrderNumber()
    const orderId = randomUUID()

    // 5. Allocate payment: products first, then packaging
    const paidForProducts = Math.min(subtotal, data.paidAmount)
    const paidForPackaging = Math.min(packagingTotal, Math.max(0, data.paidAmount - subtotal))

    // Debt changes (negative balance = client owes money)
    const productDebtChange = subtotal - paidForProducts
    const packagingDebtChange = packagingTotal - paidForPackaging

    // 6. Build all writes and execute them ATOMICALLY (tout ou rien)
    const writes: unknown[] = []

    // 6a. Sales order
    writes.push(sqlRaw`
      INSERT INTO sales_orders (
        id, company_id, client_id, depot_id, order_number, status,
        order_source, subtotal, packaging_total, total_amount,
        paid_amount, paid_amount_products, paid_amount_packaging,
        payment_method, notes, created_by
      ) VALUES (
        ${orderId}, ${companyId}, ${data.clientId}, ${data.depotId}, ${orderNumber},
        'confirmed', ${data.orderSource || 'in_person'}, ${subtotal},
        ${packagingTotal}, ${totalAmount}, ${data.paidAmount},
        ${paidForProducts}, ${paidForPackaging},
        ${data.paymentMethod}, ${data.notes || null}, ${session.user.id}
      )
    `)

    // 6b. Order items + stock deduction + movements
    for (const item of data.items) {
      writes.push(sqlRaw`
        INSERT INTO sales_order_items (
          sales_order_id, product_variant_id, quantity,
          unit_price, total_price, lot_number
        ) VALUES (
          ${orderId}, ${item.productVariantId}, ${item.quantity},
          ${item.unitPrice}, ${item.quantity * item.unitPrice},
          ${item.lotNumber || null}
        )
      `)
      writes.push(sqlRaw`
        UPDATE stock
        SET quantity = quantity - ${item.quantity}, updated_at = NOW()
        WHERE depot_id = ${data.depotId}
          AND product_variant_id = ${item.productVariantId}
          AND quantity >= ${item.quantity}
      `)
      writes.push(sqlRaw`
        INSERT INTO stock_movements (
          company_id, depot_id, product_variant_id,
          movement_type, quantity, reference_type, reference_id,
          lot_number, created_by
        ) VALUES (
          ${companyId}, ${data.depotId}, ${item.productVariantId},
          'sale', ${-item.quantity}, 'sales_order', ${orderId},
          ${item.lotNumber || null}, ${session.user.id}
        )
      `)
    }

    // 6c. Packaging items
    if (data.packagingItems && data.packagingItems.length > 0) {
      for (const pkg of data.packagingItems) {
        writes.push(sqlRaw`
          INSERT INTO sales_order_packaging_items (
            sales_order_id, packaging_type_id,
            quantity_out, quantity_in, unit_price
          ) VALUES (
            ${orderId}, ${pkg.packagingTypeId},
            ${pkg.quantityOut}, ${pkg.quantityIn}, ${pkg.unitPrice}
          )
        `)

        const netOut = pkg.quantityOut - pkg.quantityIn
        if (netOut !== 0) {
          writes.push(sqlRaw`
            INSERT INTO packaging_transactions (
              company_id, client_id, sales_order_id,
              packaging_type_id, transaction_type, quantity,
              unit_price, total_amount, created_by
            ) VALUES (
              ${companyId}, ${data.clientId}, ${orderId},
              ${pkg.packagingTypeId},
              ${netOut > 0 ? 'given' : 'returned'},
              ${Math.abs(netOut)},
              ${pkg.unitPrice},
              ${Math.abs(netOut) * pkg.unitPrice},
              ${session.user.id}
            )
          `)
        }

        if (pkg.quantityOut > 0) {
          writes.push(sqlRaw`
            UPDATE packaging_stock
            SET quantity = quantity - ${pkg.quantityOut}, updated_at = NOW()
            WHERE depot_id = ${data.depotId}
              AND packaging_type_id = ${pkg.packagingTypeId}
          `)
        }
        if (pkg.quantityIn > 0) {
          writes.push(sqlRaw`
            UPDATE packaging_stock
            SET quantity = quantity + ${pkg.quantityIn}, updated_at = NOW()
            WHERE depot_id = ${data.depotId}
              AND packaging_type_id = ${pkg.packagingTypeId}
          `)
        }
      }
    }

    // 6d. Client accounts
    if (productDebtChange !== 0) {
      writes.push(sqlRaw`
        UPDATE client_accounts
        SET balance = balance - ${productDebtChange},
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE client_id = ${data.clientId} AND account_type = 'product'
      `)
    }
    if (packagingDebtChange !== 0) {
      writes.push(sqlRaw`
        UPDATE client_accounts
        SET balance = balance - ${packagingDebtChange},
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE client_id = ${data.clientId} AND account_type = 'packaging'
      `)
    }

    // 6d-bis. Notes de crédit (créances) — une par type de dette restante.
    // N'altère PAS client_accounts (déjà fait en 6d) pour éviter le double comptage.
    if (productDebtChange > 0 || packagingDebtChange > 0) {
      const cnCount = await sql`
        SELECT COUNT(*) as count FROM credit_notes WHERE company_id = ${companyId}
      `
      let nextNumber = Number(cnCount[0].count)
      const termsDays = Number(clients[0].payment_terms_days || 0)
      const dueDate = termsDays > 0
        ? new Date(Date.now() + termsDays * 86400000).toISOString().slice(0, 10)
        : null

      if (productDebtChange > 0) {
        nextNumber += 1
        const creditNumber = `CR-${String(nextNumber).padStart(5, '0')}`
        const creditStatus = paidForProducts > 0 ? 'partial' : 'pending'
        writes.push(sqlRaw`
          INSERT INTO credit_notes (
            company_id, client_id, sales_order_id, credit_number, account_type,
            total_amount, paid_amount, due_date, status, created_by
          ) VALUES (
            ${companyId}, ${data.clientId}, ${orderId}, ${creditNumber}, 'product',
            ${subtotal}, ${paidForProducts}, ${dueDate}, ${creditStatus}, ${session.user.id}
          )
        `)
      }

      if (packagingDebtChange > 0) {
        nextNumber += 1
        const creditNumber = `CR-${String(nextNumber).padStart(5, '0')}`
        const creditStatus = paidForPackaging > 0 ? 'partial' : 'pending'
        writes.push(sqlRaw`
          INSERT INTO credit_notes (
            company_id, client_id, sales_order_id, credit_number, account_type,
            total_amount, paid_amount, due_date, status, created_by
          ) VALUES (
            ${companyId}, ${data.clientId}, ${orderId}, ${creditNumber}, 'packaging',
            ${packagingTotal}, ${paidForPackaging}, ${dueDate}, ${creditStatus}, ${session.user.id}
          )
        `)
      }
    }

    // 6e. Payments (separate records for product and packaging portions)
    if (paidForProducts > 0) {
      writes.push(sqlRaw`
        INSERT INTO payments (
          company_id, client_id, sales_order_id,
          amount, payment_method, payment_type, status, received_by
        ) VALUES (
          ${companyId}, ${data.clientId}, ${orderId},
          ${paidForProducts}, ${data.paymentMethod}, 'product',
          'completed', ${session.user.id}
        )
      `)
    }
    if (paidForPackaging > 0) {
      writes.push(sqlRaw`
        INSERT INTO payments (
          company_id, client_id, sales_order_id,
          amount, payment_method, payment_type, status, received_by
        ) VALUES (
          ${companyId}, ${data.clientId}, ${orderId},
          ${paidForPackaging}, ${data.paymentMethod}, 'packaging',
          'completed', ${session.user.id}
        )
      `)
    }

    // Execute the whole sale atomically
    await transaction(writes)

    // Fetch the created order for the response
    const orders = await sql`SELECT * FROM sales_orders WHERE id = ${orderId}`
    const order = orders[0]

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

    // 12. Créer automatiquement le mouvement de caisse pour les paiements en espèces
    if (data.paidAmount > 0 && (data.paymentMethod === 'cash' || data.paymentMethod === 'mixed')) {
      try {
        // Vérifier si le mouvement existe déjà
        const existingMovement = await hasExistingCashMovement(companyId, 'sales_order', order.id)
        if (!existingMovement) {
          await createCashMovementFromSale(
            companyId,
            order.id,
            data.paidAmount,
            'cash',
            session.user.id
          )
        }
      } catch (cashError) {
        console.error('Error creating cash movement (non-blocking):', cashError)
      }
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
    const authz = await requirePermission('sales.read')
    if (!authz.ok) return authz.response
    const { session } = authz

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
