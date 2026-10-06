import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'

// GET /api/procurement/[id] — détail d'une commande d'achat et de ses lignes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await requirePermission('purchases.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { id } = await params
    if (!isUuid(id)) throw notFound('Commande')

    const orders = await sql`
      SELECT
        po.*,
        s.name as supplier_name,
        d.name as depot_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN depots d ON po.depot_id = d.id
      WHERE po.id = ${id} AND po.company_id = ${companyId}
    `
    if (orders.length === 0) throw notFound('Commande')

    const items = await sql`
      SELECT
        poi.*,
        p.name as product_name,
        pt.name as packaging_name
      FROM purchase_order_items poi
      JOIN product_variants pv ON poi.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
      WHERE poi.purchase_order_id = ${id}
      ORDER BY p.name, pt.name, poi.id
    `

    return NextResponse.json({
      success: true,
      data: { ...orders[0], items },
    })
  } catch (error) {
    return handleRouteError(error, 'procurement.detail')
  }
}
