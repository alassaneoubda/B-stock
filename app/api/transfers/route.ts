import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'
import { nextDocumentNumber } from '@/lib/sequences'

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

// GET /api/transfers — List depot transfers
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('transfers.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const { limit, offset } = listSchema.parse({
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
    })

    const transfers = await sql`
      SELECT dt.*,
        sd.name as source_depot_name,
        dd.name as destination_depot_name,
        cu.full_name as created_by_name,
        ru.full_name as received_by_name,
        (SELECT COUNT(*) FROM depot_transfer_items WHERE depot_transfer_id = dt.id) as items_count
      FROM depot_transfers dt
      LEFT JOIN depots sd ON dt.source_depot_id = sd.id
      LEFT JOIN depots dd ON dt.destination_depot_id = dd.id
      LEFT JOIN users cu ON dt.created_by = cu.id
      LEFT JOIN users ru ON dt.received_by = ru.id
      WHERE dt.company_id = ${companyId}
      ORDER BY dt.created_at DESC, dt.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    return NextResponse.json({ success: true, data: transfers })
  } catch (error) {
    return handleRouteError(error, 'transfers.list')
  }
}

const transferItemSchema = z
  .object({
    item_type: z.enum(['product', 'packaging']).default('product'),
    product_variant_id: z.string().uuid().nullish(),
    packaging_type_id: z.string().uuid().nullish(),
    quantity: z.number().int().positive(),
  })
  .refine(
    (i) =>
      i.item_type === 'product'
        ? Boolean(i.product_variant_id) && !i.packaging_type_id
        : Boolean(i.packaging_type_id) && !i.product_variant_id,
    { message: "Chaque article doit référencer soit un produit, soit un type d'emballage" }
  )

const createTransferSchema = z
  .object({
    source_depot_id: z.string().uuid(),
    destination_depot_id: z.string().uuid(),
    notes: z.string().trim().max(2000).nullish(),
    items: z.array(transferItemSchema).min(1, 'Articles requis'),
  })
  .refine((d) => d.source_depot_id !== d.destination_depot_id, {
    message: 'Les dépôts source et destination doivent être différents',
    path: ['destination_depot_id'],
  })

// POST /api/transfers — Create a depot transfer (stock inchangé tant qu'il n'est pas réceptionné)
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('transfers.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const data = createTransferSchema.parse(await request.json())

    const transfer = await withTransaction(async (tx) => {
      await assertOwned(tx.sql, companyId, {
        depots: [data.source_depot_id, data.destination_depot_id],
        variants: data.items.map((i) => i.product_variant_id),
        packagingTypes: data.items.map((i) => i.packaging_type_id),
      })

      const transferNumber = await nextDocumentNumber(tx, companyId, 'transfer')

      const [created] = await tx.sql`
        INSERT INTO depot_transfers (company_id, transfer_number, source_depot_id, destination_depot_id, notes, created_by)
        VALUES (${companyId}, ${transferNumber}, ${data.source_depot_id}, ${data.destination_depot_id}, ${data.notes || null}, ${userId})
        RETURNING *
      `

      for (const item of data.items) {
        await tx.sql`
          INSERT INTO depot_transfer_items (depot_transfer_id, product_variant_id, packaging_type_id, item_type, quantity_sent)
          VALUES (
            ${created.id},
            ${item.item_type === 'product' ? item.product_variant_id : null},
            ${item.item_type === 'packaging' ? item.packaging_type_id : null},
            ${item.item_type},
            ${item.quantity}
          )
        `
      }

      return created
    })

    return NextResponse.json({ success: true, data: transfer }, { status: 201 })
  } catch (error) {
    return handleRouteError(error, 'transfers.create')
  }
}
