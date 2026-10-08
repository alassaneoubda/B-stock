import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'
import { catalogPriceTtc, loadVatSettings } from '@/lib/vat'

const querySchema = z.object({
  depotId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  category: z.string().trim().min(1).optional(),
  lowStock: z.enum(['true', 'false']).optional(),
  search: z.string().trim().min(1).optional(),
  // Pagination optionnelle : sans `limit`, toute la liste est renvoyée (les écrans
  // de vente / chargement consolident le stock complet côté client).
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).default(0),
})

// GET /api/stock — List stock items with filters
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('stock.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const q = querySchema.parse({
      depotId: searchParams.get('depotId') || undefined,
      productId: searchParams.get('productId') || undefined,
      category: searchParams.get('category') || undefined,
      lowStock: searchParams.get('lowStock') || undefined,
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
    })

    if (q.depotId) await assertOwned(sql, companyId, { depots: [q.depotId] })

    const depotId = q.depotId ?? null
    const productId = q.productId ?? null
    const category = q.category ?? null
    const search = q.search ? q.search.toLowerCase() : null
    const lowStock = q.lowStock === 'true'
    const limit = q.limit ?? null

    const stockItems = await sql`
      SELECT
        s.id, s.quantity, s.lot_number, s.expiry_date, s.min_stock_alert,
        s.product_variant_id,
        pv.id as variant_id, pv.price, pv.cost_price, pv.barcode, pv.unit_variant_id,
        -- Coût moyen pondéré du dépôt (repli : prix d'achat catalogue) et valeur du lot au CMP
        COALESCE(sc.avg_cost, pv.cost_price, 0)::float AS avg_cost,
        (s.quantity * COALESCE(sc.avg_cost, pv.cost_price, 0))::float AS stock_value,
        p.id as product_id, p.name as product_name, p.category, p.brand, p.sku,
        to_jsonb(p) ->> 'vat_rate' AS vat_rate,
        pt.name as packaging_name, pt.units_per_case,
        d.name as depot_name, d.id as depot_id
      FROM stock s
      JOIN product_variants pv ON s.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
      JOIN depots d ON s.depot_id = d.id
      LEFT JOIN stock_costs sc ON sc.depot_id = s.depot_id AND sc.product_variant_id = pv.id
      WHERE d.company_id = ${companyId}
        AND p.company_id = ${companyId}
        AND p.is_active = true
        AND (${depotId}::uuid IS NULL OR s.depot_id = ${depotId}::uuid)
        AND (${productId}::uuid IS NULL OR p.id = ${productId}::uuid)
        AND (${category}::text IS NULL OR p.category = ${category}::text)
        AND (NOT ${lowStock}::boolean OR s.quantity <= COALESCE(s.min_stock_alert, 0))
        AND (
          ${search}::text IS NULL
          OR strpos(lower(p.name), ${search}::text) > 0
          OR strpos(lower(COALESCE(p.sku, '')), ${search}::text) > 0
          OR strpos(lower(COALESCE(p.brand, '')), ${search}::text) > 0
        )
      ORDER BY p.name, pt.name, d.name, s.lot_number NULLS FIRST, s.id
      LIMIT ${limit}::int OFFSET ${q.offset}
    `

    // Prix saisis HT (entreprise assujettie) : `price` = prix de vente TTC, `price_ht` = prix saisi
    const vat = await loadVatSettings(sql, companyId)
    const data =
      vat.enabled && !vat.pricesIncludeTax
        ? stockItems.map((s) => ({ ...s, price_ht: s.price, price: catalogPriceTtc(vat, Number(s.price), s.vat_rate) }))
        : stockItems

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleRouteError(error, 'stock.list')
  }
}
