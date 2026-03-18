import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/stock — List stock items with filters
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const depotId = searchParams.get('depotId')
    const productId = searchParams.get('productId')
    const category = searchParams.get('category')
    const lowStock = searchParams.get('lowStock')
    const search = searchParams.get('search')

    let stockItems

    if (depotId) {
      stockItems = await sql`
        SELECT 
          s.id, s.quantity, s.lot_number, s.expiry_date, s.min_stock_alert,
          pv.id as variant_id, pv.price, pv.cost_price, pv.barcode,
          p.id as product_id, p.name as product_name, p.category, p.brand, p.sku,
          pt.name as packaging_name, pt.units_per_case,
          d.name as depot_name
        FROM stock s
        JOIN product_variants pv ON s.product_variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
        JOIN depots d ON s.depot_id = d.id
        WHERE d.company_id = ${session.user.companyId}
          AND s.depot_id = ${depotId}
          AND p.is_active = true
        ORDER BY p.name, pt.name
      `
    } else {
      stockItems = await sql`
        SELECT 
          s.id, s.quantity, s.lot_number, s.expiry_date, s.min_stock_alert,
          pv.id as variant_id, pv.price, pv.cost_price, pv.barcode,
          p.id as product_id, p.name as product_name, p.category, p.brand, p.sku,
          pt.name as packaging_name, pt.units_per_case,
          d.name as depot_name, d.id as depot_id
        FROM stock s
        JOIN product_variants pv ON s.product_variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
        JOIN depots d ON s.depot_id = d.id
        WHERE d.company_id = ${session.user.companyId}
          AND p.is_active = true
        ORDER BY p.name, pt.name
      `
    }

    // Filter in JS for optional params (category, lowStock, search)
    let filtered = stockItems as Array<Record<string, unknown>>

    if (category) {
      filtered = filtered.filter((s) => s.category === category)
    }
    if (productId) {
      filtered = filtered.filter((s) => s.product_id === productId)
    }
    if (lowStock === 'true') {
      filtered = filtered.filter(
        (s) => Number(s.quantity) <= Number(s.min_stock_alert)
      )
    }
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (s) =>
          String(s.product_name).toLowerCase().includes(q) ||
          String(s.sku || '').toLowerCase().includes(q) ||
          String(s.brand || '').toLowerCase().includes(q)
      )
    }

    return NextResponse.json({ success: true, data: filtered })
  } catch (error) {
    console.error('Error fetching stock:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du stock' },
      { status: 500 }
    )
  }
}
