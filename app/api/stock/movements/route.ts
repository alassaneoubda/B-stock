import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'

const querySchema = z.object({
  depotId: z.string().uuid().optional(),
  movementType: z.string().regex(/^[a-z_]{1,30}$/, 'Type de mouvement invalide').optional(),
  productVariantId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

// GET /api/stock/movements — List stock movement history
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('stock.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const q = querySchema.parse({
      depotId: searchParams.get('depotId') || undefined,
      movementType: searchParams.get('movementType') || undefined,
      productVariantId: searchParams.get('productVariantId') || undefined,
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
    })

    await assertOwned(sql, companyId, {
      depots: [q.depotId],
      variants: [q.productVariantId],
    })

    const depotId = q.depotId ?? null
    const movementType = q.movementType ?? null
    const variantId = q.productVariantId ?? null

    const movements = await sql`
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
      WHERE sm.company_id = ${companyId}
        AND (${depotId}::uuid IS NULL OR sm.depot_id = ${depotId}::uuid)
        AND (${movementType}::text IS NULL OR sm.movement_type = ${movementType}::text)
        AND (${variantId}::uuid IS NULL OR sm.product_variant_id = ${variantId}::uuid)
      ORDER BY sm.created_at DESC, sm.id DESC
      LIMIT ${q.limit} OFFSET ${q.offset}
    `

    return NextResponse.json({ success: true, data: movements })
  } catch (error) {
    return handleRouteError(error, 'stock.movements.list')
  }
}
