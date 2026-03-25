import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/inventory/[id] — Get inventory session with items
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const inventoryId = params.id

    const sessions = await sql`
      SELECT is2.*, d.name as depot_name, su.full_name as started_by_name
      FROM inventory_sessions is2
      LEFT JOIN depots d ON is2.depot_id = d.id
      LEFT JOIN users su ON is2.started_by = su.id
      WHERE is2.id = ${inventoryId} AND is2.company_id = ${companyId}
    `
    if (sessions.length === 0) {
      return NextResponse.json({ error: 'Inventaire introuvable' }, { status: 404 })
    }

    const items = await sql`
      SELECT ii.*,
        p.name as product_name, pt_pkg.name as packaging_name,
        pv.price as variant_price, pt_var.name as variant_packaging
      FROM inventory_items ii
      LEFT JOIN product_variants pv ON ii.product_variant_id = pv.id
      LEFT JOIN products p ON pv.product_id = p.id
      LEFT JOIN packaging_types pt_var ON pv.packaging_type_id = pt_var.id
      LEFT JOIN packaging_types pt_pkg ON ii.packaging_type_id = pt_pkg.id
      WHERE ii.inventory_session_id = ${inventoryId}
      ORDER BY ii.item_type, p.name, pt_pkg.name
    `

    return NextResponse.json({ success: true, data: { session: sessions[0], items } })
  } catch (error) {
    console.error('Inventory detail error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// PUT /api/inventory/[id] — Update counted quantities
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const userId = session.user.id
    const inventoryId = params.id
    const body = await request.json()
    const { items } = body // [{ id, counted_quantity, notes }]

    const sessions = await sql`
      SELECT * FROM inventory_sessions WHERE id = ${inventoryId} AND company_id = ${companyId}
    `
    if (sessions.length === 0) {
      return NextResponse.json({ error: 'Inventaire introuvable' }, { status: 404 })
    }
    if (sessions[0].status !== 'in_progress') {
      return NextResponse.json({ error: 'Inventaire déjà finalisé' }, { status: 400 })
    }

    if (items && items.length > 0) {
      for (const item of items) {
        await sql`
          UPDATE inventory_items SET
            counted_quantity = ${item.counted_quantity},
            notes = COALESCE(${item.notes || null}, notes),
            counted_by = ${userId},
            counted_at = NOW()
          WHERE id = ${item.id} AND inventory_session_id = ${inventoryId}
        `
      }
    }

    return NextResponse.json({ success: true, message: 'Quantités mises à jour' })
  } catch (error) {
    console.error('Update inventory error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
