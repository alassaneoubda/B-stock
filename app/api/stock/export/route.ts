import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'

// GET /api/stock/export — Get stock data for PDF export
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('stock.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const products = await sql`
      SELECT 
        p.name,
        p.sku,
        p.category,
        p.selling_price,
        p.purchase_price,
        COALESCE(p.stock_quantity, 0) as stock_quantity,
        p.min_stock_level,
        p.unit
      FROM products p
      WHERE p.company_id = ${companyId}
        AND p.is_active = true
      ORDER BY p.name
    `

    const company = await sql`
      SELECT name, phone, address, email
      FROM companies
      WHERE id = ${companyId}
    `

    return NextResponse.json({
      success: true,
      data: {
        products,
        company: company[0] || {},
        exportDate: new Date().toISOString(),
      }
    })
  } catch (error) {
    console.error('Error exporting stock:', error)
    return NextResponse.json({ error: 'Erreur lors de l\'export' }, { status: 500 })
  }
}
