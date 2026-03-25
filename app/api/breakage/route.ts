import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/breakage — List breakage/loss records
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const { searchParams } = new URL(request.url)
    const recordType = searchParams.get('type')

    const records = await sql`
      SELECT br.*,
        d.name as depot_name,
        p.name as product_name,
        pt.name as packaging_name,
        pv.price as variant_price,
        ptv.name as variant_packaging,
        ru.full_name as reported_by_name,
        au.full_name as approved_by_name
      FROM breakage_records br
      LEFT JOIN depots d ON br.depot_id = d.id
      LEFT JOIN product_variants pv ON br.product_variant_id = pv.id
      LEFT JOIN products p ON pv.product_id = p.id
      LEFT JOIN packaging_types ptv ON pv.packaging_type_id = ptv.id
      LEFT JOIN packaging_types pt ON br.packaging_type_id = pt.id
      LEFT JOIN users ru ON br.reported_by = ru.id
      LEFT JOIN users au ON br.approved_by = au.id
      WHERE br.company_id = ${companyId}
        ${recordType ? sql`AND br.record_type = ${recordType}` : sql``}
      ORDER BY br.created_at DESC
      LIMIT 50
    `

    // Totals
    const stats = await sql`
      SELECT
        record_type,
        COUNT(*) as count,
        COALESCE(SUM(total_value), 0) as total_value
      FROM breakage_records
      WHERE company_id = ${companyId}
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY record_type
    `

    return NextResponse.json({ success: true, data: { records, stats } })
  } catch (error) {
    console.error('Breakage error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST /api/breakage — Report breakage/loss
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const userId = session.user.id
    const body = await request.json()
    const { depot_id, record_type, product_variant_id, packaging_type_id, item_type, quantity, unit_value, reason, delivery_tour_id } = body

    if (!record_type || !quantity || quantity <= 0) {
      return NextResponse.json({ error: 'Type et quantité requis' }, { status: 400 })
    }

    const totalValue = (quantity || 0) * (unit_value || 0)

    const result = await sql`
      INSERT INTO breakage_records (company_id, depot_id, record_type, product_variant_id, packaging_type_id, item_type, quantity, unit_value, total_value, reason, delivery_tour_id, reported_by)
      VALUES (${companyId}, ${depot_id || null}, ${record_type}, ${product_variant_id || null}, ${packaging_type_id || null}, ${item_type || 'product'}, ${quantity}, ${unit_value || 0}, ${totalValue}, ${reason || null}, ${delivery_tour_id || null}, ${userId})
      RETURNING *
    `

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    console.error('Create breakage error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
