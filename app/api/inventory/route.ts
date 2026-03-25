import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/inventory — List inventory sessions
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId

    const sessions = await sql`
      SELECT is2.*,
        d.name as depot_name,
        su.full_name as started_by_name,
        cu.full_name as completed_by_name
      FROM inventory_sessions is2
      LEFT JOIN depots d ON is2.depot_id = d.id
      LEFT JOIN users su ON is2.started_by = su.id
      LEFT JOIN users cu ON is2.completed_by = cu.id
      WHERE is2.company_id = ${companyId}
      ORDER BY is2.created_at DESC
      LIMIT 30
    `

    return NextResponse.json({ success: true, data: sessions })
  } catch (error) {
    console.error('Inventory sessions error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST /api/inventory — Start a new inventory session
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const userId = session.user.id
    const body = await request.json()
    const { depot_id, inventory_type, notes } = body

    if (!depot_id) {
      return NextResponse.json({ error: 'Dépôt requis' }, { status: 400 })
    }

    const countResult = await sql`SELECT COUNT(*) as count FROM inventory_sessions WHERE company_id = ${companyId}`
    const sessionNumber = `INV-${String(Number(countResult[0].count) + 1).padStart(5, '0')}`

    const result = await sql`
      INSERT INTO inventory_sessions (company_id, depot_id, session_number, inventory_type, started_by, notes)
      VALUES (${companyId}, ${depot_id}, ${sessionNumber}, ${inventory_type || 'full'}, ${userId}, ${notes || null})
      RETURNING *
    `

    // Pre-populate with current stock items
    const stockItems = await sql`
      SELECT s.product_variant_id, s.quantity, 
        COALESCE(pv.price, 0) as unit_value
      FROM stock s
      JOIN product_variants pv ON s.product_variant_id = pv.id
      WHERE s.depot_id = ${depot_id} AND s.quantity > 0
    `

    for (const item of stockItems) {
      await sql`
        INSERT INTO inventory_items (inventory_session_id, product_variant_id, item_type, system_quantity, unit_value)
        VALUES (${result[0].id}, ${item.product_variant_id}, 'product', ${item.quantity}, ${item.unit_value})
      `
    }

    // Also add packaging stock
    const pkgItems = await sql`
      SELECT ps.packaging_type_id, ps.quantity,
        COALESCE(pt.deposit_price, 0) as unit_value
      FROM packaging_stock ps
      JOIN packaging_types pt ON ps.packaging_type_id = pt.id
      WHERE ps.depot_id = ${depot_id} AND ps.quantity > 0
    `

    for (const item of pkgItems) {
      await sql`
        INSERT INTO inventory_items (inventory_session_id, packaging_type_id, item_type, system_quantity, unit_value)
        VALUES (${result[0].id}, ${item.packaging_type_id}, 'packaging', ${item.quantity}, ${item.unit_value})
      `
    }

    const totalItems = stockItems.length + pkgItems.length
    await sql`UPDATE inventory_sessions SET total_items = ${totalItems} WHERE id = ${result[0].id}`

    return NextResponse.json({ success: true, data: { ...result[0], total_items: totalItems } })
  } catch (error) {
    console.error('Create inventory error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
