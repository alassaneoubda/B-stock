import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/transfers — List depot transfers
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId

    const transfers = await sql`
      SELECT dt.*,
        sd.name as source_depot_name,
        dd.name as destination_depot_name,
        cu.full_name as created_by_name,
        ru.full_name as received_by_name,
        (SELECT COUNT(*) FROM depot_transfer_items WHERE depot_transfer_id = dt.id) as items_count
      FROM depot_transfers dt
      LEFT JOIN depots sd ON dt.source_depot_id = sd.id
      LEFT JOIN depots dd ON dt.destination_depot_id = dd.id
      LEFT JOIN users cu ON dt.created_by = cu.id
      LEFT JOIN users ru ON dt.received_by = ru.id
      WHERE dt.company_id = ${companyId}
      ORDER BY dt.created_at DESC
      LIMIT 50
    `

    return NextResponse.json({ success: true, data: transfers })
  } catch (error) {
    console.error('Transfers error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST /api/transfers — Create a depot transfer
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const userId = session.user.id
    const body = await request.json()
    const { source_depot_id, destination_depot_id, notes, items } = body

    if (!source_depot_id || !destination_depot_id || source_depot_id === destination_depot_id) {
      return NextResponse.json({ error: 'Dépôts source et destination invalides' }, { status: 400 })
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Articles requis' }, { status: 400 })
    }

    const countResult = await sql`SELECT COUNT(*) as count FROM depot_transfers WHERE company_id = ${companyId}`
    const transferNumber = `TRF-${String(Number(countResult[0].count) + 1).padStart(5, '0')}`

    const result = await sql`
      INSERT INTO depot_transfers (company_id, transfer_number, source_depot_id, destination_depot_id, notes, created_by)
      VALUES (${companyId}, ${transferNumber}, ${source_depot_id}, ${destination_depot_id}, ${notes || null}, ${userId})
      RETURNING *
    `

    for (const item of items) {
      await sql`
        INSERT INTO depot_transfer_items (depot_transfer_id, product_variant_id, packaging_type_id, item_type, quantity_sent)
        VALUES (${result[0].id}, ${item.product_variant_id || null}, ${item.packaging_type_id || null}, ${item.item_type || 'product'}, ${item.quantity})
      `
    }

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    console.error('Create transfer error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
