import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

function generateInvoiceNumber(type: string): string {
  const prefix = type === 'client' ? 'FC' : 'FF'
  const date = new Date()
  const y = date.getFullYear().toString().slice(-2)
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${prefix}-${y}${m}-${rand}`
}

// POST /api/invoices/generate — Auto-generate invoice from a sales order
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const { orderId } = await request.json()

    if (!orderId) {
      return NextResponse.json({ error: 'orderId requis' }, { status: 400 })
    }

    // Check if invoice already exists for this order
    const existing = await sql`
      SELECT id, invoice_number FROM invoices
      WHERE order_id = ${orderId} AND company_id = ${companyId}
    `
    if (existing.length > 0) {
      return NextResponse.json({
        success: true,
        data: existing[0],
        message: 'Facture déjà générée'
      })
    }

    // Fetch the sales order
    const orders = await sql`
      SELECT so.*, c.name as client_name
      FROM sales_orders so
      LEFT JOIN clients c ON so.client_id = c.id
      WHERE so.id = ${orderId} AND so.company_id = ${companyId}
    `

    if (orders.length === 0) {
      return NextResponse.json({ error: 'Commande non trouvée' }, { status: 404 })
    }

    const order = orders[0]

    // Fetch order items
    const orderItems = await sql`
      SELECT soi.*, p.name as product_name
      FROM sales_order_items soi
      LEFT JOIN products p ON soi.product_id = p.id
      WHERE soi.sales_order_id = ${orderId}
    `

    // Fetch packaging items
    const packagingItems = await sql`
      SELECT sopi.*, pt.name as packaging_name
      FROM sales_order_packaging_items sopi
      LEFT JOIN packaging_types pt ON sopi.packaging_type_id = pt.id
      WHERE sopi.sales_order_id = ${orderId}
    `

    const totalAmount = Number(order.total_amount)
    const amountPaid = Number(order.paid_amount)
    const remaining = totalAmount - amountPaid
    const invoiceStatus = amountPaid >= totalAmount ? 'paid' : amountPaid > 0 ? 'partial' : 'draft'
    const invoiceNumber = generateInvoiceNumber('client')

    // Create invoice
    const result = await sql`
      INSERT INTO invoices (
        invoice_number, type, company_id, client_id,
        order_id, total_ht, total_ttc, total_amount,
        amount_paid, remaining_amount, status
      ) VALUES (
        ${invoiceNumber}, 'client', ${companyId}, ${order.client_id},
        ${orderId}, ${totalAmount}, ${totalAmount}, ${totalAmount},
        ${amountPaid}, ${remaining}, ${invoiceStatus}
      )
      RETURNING *
    `

    const invoice = result[0]

    // Insert product items
    for (const item of orderItems) {
      const lineTotal = Number(item.quantity) * Number(item.unit_price)
      await sql`
        INSERT INTO invoice_items (
          invoice_id, product_id, description,
          quantity, unit_price, total_price, item_type
        ) VALUES (
          ${invoice.id}, ${item.product_id}, ${item.product_name || 'Produit'},
          ${item.quantity}, ${item.unit_price}, ${lineTotal}, 'product'
        )
      `
    }

    // Insert packaging items
    for (const item of packagingItems) {
      const lineTotal = Number(item.quantity) * Number(item.unit_price || 0)
      await sql`
        INSERT INTO invoice_items (
          invoice_id, product_id, description,
          quantity, unit_price, total_price, item_type
        ) VALUES (
          ${invoice.id}, NULL, ${item.packaging_name || 'Emballage'},
          ${item.quantity}, ${item.unit_price || 0}, ${lineTotal}, 'packaging'
        )
      `
    }

    return NextResponse.json({
      success: true,
      data: invoice,
      message: 'Facture générée avec succès'
    }, { status: 201 })
  } catch (error) {
    console.error('Error generating invoice:', error)
    return NextResponse.json({ error: 'Erreur lors de la génération de la facture' }, { status: 500 })
  }
}
