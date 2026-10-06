import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { badRequest, handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'

const RECORD_TYPES = ['breakage', 'loss', 'expiry', 'theft'] as const

const listSchema = z.object({
  type: z.enum(RECORD_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

// GET /api/breakage — List breakage/loss records
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('breakage.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const q = listSchema.parse({
      type: searchParams.get('type') || undefined,
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
    })
    const recordType = q.type ?? null

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
        AND (${recordType}::text IS NULL OR br.record_type = ${recordType}::text)
      ORDER BY br.created_at DESC, br.id DESC
      LIMIT ${q.limit} OFFSET ${q.offset}
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
    return handleRouteError(error, 'breakage.list')
  }
}

const createSchema = z
  .object({
    record_type: z.enum(RECORD_TYPES),
    depot_id: z.string().uuid().nullish(),
    product_variant_id: z.string().uuid().nullish(),
    packaging_type_id: z.string().uuid().nullish(),
    item_type: z.enum(['product', 'packaging']).nullish(),
    quantity: z.number().int().positive(),
    unit_value: z.number().nonnegative().nullish(),
    reason: z.string().trim().max(1000).nullish(),
    delivery_tour_id: z.string().uuid().nullish(),
  })
  .refine((d) => !(d.product_variant_id && d.packaging_type_id), {
    message: "Indiquer soit un produit, soit un type d'emballage, pas les deux",
    path: ['packaging_type_id'],
  })

// POST /api/breakage — Report breakage/loss
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('breakage.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const data = createSchema.parse(await request.json())

    // Sans dépôt, l'approbation ne pourrait pas déduire le stock.
    if ((data.product_variant_id || data.packaging_type_id) && !data.depot_id) {
      throw badRequest('Veuillez choisir le dépôt concerné')
    }

    await assertOwned(sql, companyId, {
      depots: [data.depot_id],
      variants: [data.product_variant_id],
      packagingTypes: [data.packaging_type_id],
      deliveryTours: [data.delivery_tour_id],
    })

    const itemType = data.packaging_type_id ? 'packaging' : (data.item_type ?? 'product')
    const unitValue = data.unit_value ?? 0
    const totalValue = data.quantity * unitValue

    const result = await sql`
      INSERT INTO breakage_records (
        company_id, depot_id, record_type, product_variant_id, packaging_type_id, item_type,
        quantity, unit_value, total_value, reason, delivery_tour_id, reported_by
      ) VALUES (
        ${companyId}, ${data.depot_id ?? null}, ${data.record_type},
        ${data.product_variant_id ?? null}, ${data.packaging_type_id ?? null}, ${itemType},
        ${data.quantity}, ${unitValue}, ${totalValue}, ${data.reason || null},
        ${data.delivery_tour_id ?? null}, ${userId}
      )
      RETURNING *
    `

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    return handleRouteError(error, 'breakage.create')
  }
}
