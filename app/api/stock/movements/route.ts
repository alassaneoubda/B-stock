import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/stock/movements — List stock movement history
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const depotId = searchParams.get('depotId')
    const movementType = searchParams.get('movementType')
    const productVariantId = searchParams.get('productVariantId')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    let movements

    if (depotId) {
      movements = await sql`
        SELECT 
          sm.*,
          p.name as product_name, p.brand,
          pt.name as packaging_name,
          d.name as depot_name,
          u.full_name as created_by_name
        FROM stock_movements sm
        LEFT JOIN product_variants pv ON sm.product_variant_id = pv.id
        LEFT JOIN products p ON pv.product_id = p.id
        LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
        LEFT JOIN depots d ON sm.depot_id = d.id
        LEFT JOIN users u ON sm.created_by = u.id
        WHERE sm.company_id = ${session.user.companyId}
          AND sm.depot_id = ${depotId}
        ORDER BY sm.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else {
      movements = await sql`
        SELECT 
          sm.*,
          p.name as product_name, p.brand,
          pt.name as packaging_name,
          d.name as depot_name,
          u.full_name as created_by_name
        FROM stock_movements sm
        LEFT JOIN product_variants pv ON sm.product_variant_id = pv.id
        LEFT JOIN products p ON pv.product_id = p.id
        LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
        LEFT JOIN depots d ON sm.depot_id = d.id
        LEFT JOIN users u ON sm.created_by = u.id
        WHERE sm.company_id = ${session.user.companyId}
        ORDER BY sm.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    }

    // Apply JS filters for optional params
    let filtered = movements as Array<Record<string, unknown>>

    if (movementType) {
      filtered = filtered.filter((m) => m.movement_type === movementType)
    }
    if (productVariantId) {
      filtered = filtered.filter((m) => m.product_variant_id === productVariantId)
    }

    return NextResponse.json({ success: true, data: filtered })
  } catch (error) {
    console.error('Error fetching stock movements:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des mouvements de stock' },
      { status: 500 }
    )
  }
}
