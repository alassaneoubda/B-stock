import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'
import { unpackStock } from '@/lib/domain/stock'

const listSchema = z.object({
  depotId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(30),
  offset: z.coerce.number().int().min(0).default(0),
})

// GET /api/stock/unpack — historique des ouvertures de casier
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('stock.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const sp = new URL(request.url).searchParams
    const q = listSchema.parse({
      depotId: sp.get('depotId') || undefined,
      productId: sp.get('productId') || undefined,
      limit: sp.get('limit') || undefined,
      offset: sp.get('offset') || undefined,
    })
    const depotId = q.depotId ?? null
    const productId = q.productId ?? null

    const rows = await sql`
      SELECT su.id, su.created_at, su.packs, su.units, su.source, su.notes,
             su.pack_unit_cost::float AS pack_unit_cost, su.unit_cost::float AS unit_cost,
             (su.packs * su.pack_unit_cost)::float AS value,
             su.pack_variant_id, su.unit_variant_id, su.depot_id,
             p.id AS product_id, p.name AS product_name,
             ppt.name AS pack_name, upt.name AS unit_name,
             d.name AS depot_name, u.full_name AS created_by_name,
             po.ticket_number
      FROM stock_unpacks su
      JOIN product_variants pv ON pv.id = su.pack_variant_id
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN packaging_types ppt ON ppt.id = pv.packaging_type_id
      LEFT JOIN product_variants uv ON uv.id = su.unit_variant_id
      LEFT JOIN packaging_types upt ON upt.id = uv.packaging_type_id
      JOIN depots d ON d.id = su.depot_id
      LEFT JOIN users u ON u.id = su.created_by
      LEFT JOIN pos_orders po ON po.id = su.pos_order_id
      WHERE su.company_id = ${companyId}
        AND (${depotId}::uuid IS NULL OR su.depot_id = ${depotId}::uuid)
        AND (${productId}::uuid IS NULL OR p.id = ${productId}::uuid)
      ORDER BY su.created_at DESC, su.id DESC
      LIMIT ${q.limit} OFFSET ${q.offset}
    `
    return NextResponse.json({ success: true, data: rows })
  } catch (error) {
    return handleRouteError(error, 'stock.unpack.list')
  }
}

const unpackSchema = z.object({
  depotId: z.string().uuid({ message: 'Dépôt requis' }),
  packVariantId: z.string().uuid(),
  packs: z.coerce.number().int().positive().max(10_000),
  notes: z.string().trim().max(500).nullish(),
})

// POST /api/stock/unpack — ouvrir N casiers (sortie casiers, entrée unités, même transaction)
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('stock.adjust')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const data = unpackSchema.parse(await request.json())
    const result = await withTransaction(async (tx) => {
      await assertOwned(tx.sql, companyId, { depots: [data.depotId], variants: [data.packVariantId] })
      return unpackStock(tx, {
        companyId,
        depotId: data.depotId,
        packVariantId: data.packVariantId,
        packs: data.packs,
        userId,
        notes: data.notes ?? null,
        source: 'manual',
      })
    })
    return NextResponse.json(
      {
        success: true,
        data: result,
        message: `${result.packs} conditionnement${result.packs > 1 ? 's' : ''} ouvert${result.packs > 1 ? 's' : ''} : +${result.units} unités`,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleRouteError(error, 'stock.unpack')
  }
}
