import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'
import { nextDocumentNumber } from '@/lib/sequences'

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(30),
  offset: z.coerce.number().int().min(0).default(0),
})

// GET /api/inventory — List inventory sessions
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('inventory.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const { limit, offset } = listSchema.parse({
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
    })

    const sessions = await sql`
      SELECT is2.*,
        d.name as depot_name,
        su.full_name as started_by_name,
        cu.full_name as completed_by_name
      FROM inventory_sessions is2
      LEFT JOIN depots d ON is2.depot_id = d.id
      LEFT JOIN users su ON is2.started_by = su.id
      LEFT JOIN users cu ON is2.completed_by = cu.id
      WHERE is2.company_id = ${companyId}
      ORDER BY is2.created_at DESC, is2.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    return NextResponse.json({ success: true, data: sessions })
  } catch (error) {
    return handleRouteError(error, 'inventory.list')
  }
}

const createSchema = z.object({
  depot_id: z.string({ required_error: 'Dépôt requis' }).uuid(),
  inventory_type: z.enum(['full', 'partial', 'spot_check']).default('full'),
  notes: z.string().trim().max(2000).nullish(),
})

// POST /api/inventory — Start a new inventory session
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('inventory.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const data = createSchema.parse(await request.json())

    const session = await withTransaction(async (tx) => {
      await assertOwned(tx.sql, companyId, { depots: [data.depot_id] })

      const sessionNumber = await nextDocumentNumber(tx, companyId, 'inventory')

      const [created] = await tx.sql`
        INSERT INTO inventory_sessions (company_id, depot_id, session_number, inventory_type, started_by, notes)
        VALUES (${companyId}, ${data.depot_id}, ${sessionNumber}, ${data.inventory_type}, ${userId}, ${data.notes || null})
        RETURNING *
      `

      // Photo du stock : TOUTES les variantes des produits actifs (0 si aucun stock),
      // pour pouvoir compter aussi les articles théoriquement épuisés.
      const products = await tx.exec`
        INSERT INTO inventory_items (inventory_session_id, product_variant_id, item_type, system_quantity, unit_value)
        SELECT ${created.id}, pv.id, 'product',
          COALESCE((
            SELECT SUM(s.quantity) FROM stock s
            WHERE s.depot_id = ${data.depot_id} AND s.product_variant_id = pv.id
          ), 0)::int,
          COALESCE(pv.price, 0)
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE p.company_id = ${companyId} AND p.is_active = true
      `

      // Emballages : tous les types d'emballage de l'entreprise.
      const packagings = await tx.exec`
        INSERT INTO inventory_items (inventory_session_id, packaging_type_id, item_type, system_quantity, unit_value)
        SELECT ${created.id}, pt.id, 'packaging',
          COALESCE((
            SELECT SUM(ps.quantity) FROM packaging_stock ps
            WHERE ps.depot_id = ${data.depot_id} AND ps.packaging_type_id = pt.id
          ), 0)::int,
          COALESCE(pt.deposit_price, 0)
        FROM packaging_types pt
        WHERE pt.company_id = ${companyId}
      `

      const totalItems = products.rowCount + packagings.rowCount
      await tx.sql`UPDATE inventory_sessions SET total_items = ${totalItems} WHERE id = ${created.id}`

      return { ...created, total_items: totalItems }
    })

    return NextResponse.json({ success: true, data: session })
  } catch (error) {
    return handleRouteError(error, 'inventory.create')
  }
}
