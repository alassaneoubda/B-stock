import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/returns — List returns
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const { searchParams } = new URL(request.url)
    const returnType = searchParams.get('type')

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
        ${returnType ? sql`AND r.return_type = ${returnType}` : sql``}
      ORDER BY r.created_at DESC
      LIMIT 50
    `

    return NextResponse.json({ success: true, data: returns })
  } catch (error) {
    console.error('Returns error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST /api/returns — Create a return
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const userId = session.user.id
    const body = await request.json()
    const { return_type, client_id, supplier_id, sales_order_id, purchase_order_id, depot_id, reason, refund_method, notes, items } = body

    if (!return_type || !items || items.length === 0) {
      return NextResponse.json({ error: 'Type de retour et articles requis' }, { status: 400 })
    }

    // Generate return number
    const countResult = await sql`SELECT COUNT(*) as count FROM returns WHERE company_id = ${companyId}`
    const returnNumber = `RET-${String(Number(countResult[0].count) + 1).padStart(5, '0')}`

    // Calculate total
    let totalAmount = 0
    for (const item of items) {
      totalAmount += (item.quantity || 0) * (item.unit_price || 0)
    }

    const result = await sql`
      INSERT INTO returns (company_id, return_number, return_type, client_id, supplier_id, sales_order_id, purchase_order_id, depot_id, reason, total_amount, refund_method, notes, created_by)
      VALUES (${companyId}, ${returnNumber}, ${return_type}, ${client_id || null}, ${supplier_id || null}, ${sales_order_id || null}, ${purchase_order_id || null}, ${depot_id || null}, ${reason || null}, ${totalAmount}, ${refund_method || 'credit_note'}, ${notes || null}, ${userId})
      RETURNING *
    `

    // Insert items
    for (const item of items) {
      await sql`
        INSERT INTO return_items (return_id, product_variant_id, packaging_type_id, item_type, quantity, unit_price, total_price, condition, notes)
        VALUES (${result[0].id}, ${item.product_variant_id || null}, ${item.packaging_type_id || null}, ${item.item_type || 'product'}, ${item.quantity}, ${item.unit_price || 0}, ${(item.quantity || 0) * (item.unit_price || 0)}, ${item.condition || 'good'}, ${item.notes || null})
      `
    }

    await sql`
      INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
      VALUES (${companyId}, ${userId}, 'create', 'return', ${result[0].id}, ${JSON.stringify({ return_type, total_amount: totalAmount })}::jsonb)
    `

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    console.error('Create return error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
