import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'

const querySchema = z.object({
  depotId: z.string().uuid().optional(),
})

type ExportRow = {
  product_name: string
  packaging_name: string | null
  depot_name: string
  [key: string]: unknown
}

// GET /api/stock/export — Stock réel agrégé par variante et par dépôt (export PDF)
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('stock.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const q = querySchema.parse({ depotId: searchParams.get('depotId') || undefined })
    if (q.depotId) await assertOwned(sql, companyId, { depots: [q.depotId] })
    const depotId = q.depotId ?? null

    // Une ligne par (variante, dépôt) ayant une fiche de stock : somme de tous les lots.
    const rows = (await sql`
      SELECT
        p.id AS product_id,
        pv.id AS variant_id,
        d.id AS depot_id,
        p.name AS product_name,
        pt.name AS packaging_name,
        d.name AS depot_name,
        COALESCE(p.sku, '') AS sku,
        p.category,
        pv.price AS selling_price,
        -- Valorisation au coût moyen pondéré du dépôt (repli : prix d'achat catalogue)
        COALESCE(MAX(sc.avg_cost), pv.cost_price, p.purchase_price, 0) AS purchase_price,
        SUM(s.quantity)::int AS stock_quantity,
        COALESCE(MAX(s.min_stock_alert), 0)::int AS min_stock_level,
        p.base_unit AS unit
      FROM stock s
      JOIN depots d ON d.id = s.depot_id
      JOIN product_variants pv ON pv.id = s.product_variant_id
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN packaging_types pt ON pt.id = pv.packaging_type_id
      LEFT JOIN stock_costs sc ON sc.depot_id = d.id AND sc.product_variant_id = pv.id
      WHERE d.company_id = ${companyId}
        AND p.company_id = ${companyId}
        AND p.is_active = true
        AND (${depotId}::uuid IS NULL OR d.id = ${depotId}::uuid)
      GROUP BY p.id, pv.id, d.id, pt.name
      ORDER BY p.name, pt.name NULLS FIRST, d.name
    `) as ExportRow[]

    // Libellé lisible : « Produit — Emballage », suffixé du dépôt s'il y en a plusieurs.
    const multiDepot = new Set(rows.map((r) => r.depot_id)).size > 1
    const products = rows.map((r) => ({
      ...r,
      name:
        r.product_name +
        (r.packaging_name ? ` — ${r.packaging_name}` : '') +
        (multiDepot ? ` · ${r.depot_name}` : ''),
    }))

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
      },
    })
  } catch (error) {
    return handleRouteError(error, 'stock.export')
  }
}
