import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
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

/**
 * Périmètre d'un inventaire :
 * - full      : toutes les variantes actives + tous les emballages (inventaire complet) ;
 * - category  : les variantes d'une catégorie ;
 * - brand     : les variantes d'une marque ;
 * - selection : une liste de variantes choisies ;
 * - oldest    : les N variantes les moins récemment comptées dans ce dépôt (inventaire tournant).
 * Un inventaire partiel ne contient que ses lignes : la finalisation ne touche qu'elles.
 */
const inventoryScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('full') }),
  z.object({ type: z.literal('category'), category: z.string().trim().min(1).max(100) }),
  z.object({ type: z.literal('brand'), brand: z.string().trim().min(1).max(100) }),
  z.object({ type: z.literal('selection'), variantIds: z.array(z.string().uuid()).min(1).max(1000) }),
  z.object({ type: z.literal('oldest'), limit: z.coerce.number().int().min(1).max(500) }),
])
type InventoryScope = z.infer<typeof inventoryScopeSchema>

const createSchema = z.object({
  depot_id: z.string({ required_error: 'Dépôt requis' }).uuid(),
  inventory_type: z.enum(['full', 'partial', 'spot_check']).optional(),
  notes: z.string().trim().max(2000).nullish(),
  scope: inventoryScopeSchema.optional(),
})

// POST /api/inventory — Start a new inventory session (complet ou partiel)
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('inventory.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const data = createSchema.parse(await request.json())
    const scope: InventoryScope = data.scope ?? { type: 'full' }
    const isFull = scope.type === 'full'
    const inventoryType = isFull ? (data.inventory_type ?? 'full') : data.inventory_type === 'spot_check' ? 'spot_check' : 'partial'

    const session = await withTransaction(async (tx) => {
      await assertOwned(tx.sql, companyId, { depots: [data.depot_id] })
      if (scope.type === 'selection') {
        await assertOwned(tx.sql, companyId, { variants: scope.variantIds })
      }

      const sessionNumber = await nextDocumentNumber(tx, companyId, 'inventory')

      const [created] = await tx.sql`
        INSERT INTO inventory_sessions (company_id, depot_id, session_number, inventory_type, started_by, notes, scope)
        VALUES (${companyId}, ${data.depot_id}, ${sessionNumber}, ${inventoryType}, ${userId}, ${data.notes || null},
                ${JSON.stringify(scope)}::jsonb)
        RETURNING *
      `

      const category = scope.type === 'category' ? scope.category : null
      const brand = scope.type === 'brand' ? scope.brand : null
      const variantIds = scope.type === 'selection' ? scope.variantIds : null
      const limit = scope.type === 'oldest' ? scope.limit : null

      // Photo du stock des variantes du périmètre (0 si aucun stock, pour compter aussi les
      // articles théoriquement épuisés). Valeur unitaire = CMP du dépôt (repli : prix d'achat).
      const products = await tx.exec`
        INSERT INTO inventory_items (inventory_session_id, product_variant_id, item_type, system_quantity, unit_value)
        SELECT ${created.id}, sel.id, 'product', sel.qty, sel.unit_value
        FROM (
          SELECT pv.id,
            COALESCE((
              SELECT SUM(s.quantity) FROM stock s
              WHERE s.depot_id = ${data.depot_id} AND s.product_variant_id = pv.id
            ), 0)::int AS qty,
            COALESCE(scost.avg_cost, pv.cost_price, 0) AS unit_value,
            cnt.last_counted_at, p.name
          FROM product_variants pv
          JOIN products p ON p.id = pv.product_id
          LEFT JOIN stock_costs scost ON scost.depot_id = ${data.depot_id} AND scost.product_variant_id = pv.id
          LEFT JOIN stock_counts cnt ON cnt.depot_id = ${data.depot_id} AND cnt.product_variant_id = pv.id
          WHERE p.company_id = ${companyId} AND p.is_active = true
            AND (${category}::text IS NULL OR p.category = ${category}::text)
            AND (${brand}::text IS NULL OR p.brand = ${brand}::text)
            AND (${variantIds}::uuid[] IS NULL OR pv.id = ANY(${variantIds}::uuid[]))
        ) sel
        ORDER BY sel.last_counted_at ASC NULLS FIRST, (sel.qty > 0) DESC, sel.name, sel.id
        LIMIT ${limit}::int
      `

      // Emballages : uniquement dans un inventaire complet.
      const packagings = isFull
        ? await tx.exec`
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
        : { rowCount: 0 }

      const totalItems = (products.rowCount ?? 0) + (packagings.rowCount ?? 0)
      if (!isFull && totalItems === 0) {
        throw new AppError(400, 'Aucun article dans ce périmètre', 'EMPTY_SCOPE')
      }
      await tx.sql`UPDATE inventory_sessions SET total_items = ${totalItems} WHERE id = ${created.id}`

      return { ...created, total_items: totalItems }
    })

    return NextResponse.json({ success: true, data: session })
  } catch (error) {
    return handleRouteError(error, 'inventory.create')
  }
}
