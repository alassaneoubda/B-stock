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

// GET /api/invoices — List invoices with filters
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    const companyId = session.user.companyId

    let invoices
    if (type && status) {
      invoices = await sql`
        SELECT i.*,
          c.name as client_name,
          s.name as supplier_name
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        LEFT JOIN suppliers s ON i.supplier_id = s.id
        WHERE i.company_id = ${companyId}
          AND i.type = ${type}
          AND i.status = ${status}
        ORDER BY i.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else if (type) {
      invoices = await sql`
        SELECT i.*,
          c.name as client_name,
          s.name as supplier_name
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        LEFT JOIN suppliers s ON i.supplier_id = s.id
        WHERE i.company_id = ${companyId}
          AND i.type = ${type}
        ORDER BY i.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else if (status) {
      invoices = await sql`
        SELECT i.*,
          c.name as client_name,
          s.name as supplier_name
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        LEFT JOIN suppliers s ON i.supplier_id = s.id
        WHERE i.company_id = ${companyId}
          AND i.status = ${status}
        ORDER BY i.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else {
      invoices = await sql`
        SELECT i.*,
          c.name as client_name,
          s.name as supplier_name
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        LEFT JOIN suppliers s ON i.supplier_id = s.id
        WHERE i.company_id = ${companyId}
        ORDER BY i.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    }

    // Filter by search term in JS if provided
    let filtered = invoices
    if (search) {
      const q = search.toLowerCase()
      filtered = invoices.filter((inv: any) =>
        inv.invoice_number?.toLowerCase().includes(q) ||
        inv.client_name?.toLowerCase().includes(q) ||
        inv.supplier_name?.toLowerCase().includes(q)
      )
    }

    return NextResponse.json({ success: true, data: filtered })
  } catch (error) {
    console.error('Error fetching invoices:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération des factures' }, { status: 500 })
  }
}

// POST /api/invoices — Create a new invoice (or auto-generate from order)
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const body = await request.json()

    const {
      type,
      clientId,
      supplierId,
      orderId,
      items,
      notes,
      amountPaid,
    } = body

    if (!type || !['client', 'supplier'].includes(type)) {
      return NextResponse.json({ error: 'Type de facture invalide' }, { status: 400 })
    }

    // Calculate totals
    let totalAmount = 0
    if (items && items.length > 0) {
      totalAmount = items.reduce((acc: number, item: any) => acc + (Number(item.quantity) * Number(item.unitPrice)), 0)
    }

    const paid = Number(amountPaid || 0)
    const remaining = totalAmount - paid
    const invoiceStatus = paid >= totalAmount ? 'paid' : paid > 0 ? 'partial' : 'draft'
    const invoiceNumber = generateInvoiceNumber(type)

    const result = await sql`
      INSERT INTO invoices (
        invoice_number, type, company_id, client_id, supplier_id,
        order_id, total_ht, total_ttc, total_amount,
        amount_paid, remaining_amount, status, notes
      ) VALUES (
        ${invoiceNumber}, ${type}, ${companyId},
        ${clientId || null}, ${supplierId || null},
        ${orderId || null}, ${totalAmount}, ${totalAmount}, ${totalAmount},
        ${paid}, ${remaining}, ${invoiceStatus}, ${notes || null}
      )
      RETURNING *
    `

    const invoice = result[0]

    // Insert items
    if (items && items.length > 0) {
      for (const item of items) {
        const lineTotal = Number(item.quantity) * Number(item.unitPrice)
        await sql`
          INSERT INTO invoice_items (
            invoice_id, product_id, description,
            quantity, unit_price, total_price, item_type
          ) VALUES (
            ${invoice.id}, ${item.productId || null}, ${item.description || null},
            ${item.quantity}, ${item.unitPrice}, ${lineTotal},
            ${item.itemType || 'product'}
          )
        `
      }
    }

    return NextResponse.json({ success: true, data: invoice }, { status: 201 })
  } catch (error) {
    console.error('Error creating invoice:', error)
    return NextResponse.json({ error: 'Erreur lors de la création de la facture' }, { status: 500 })
  }
}
