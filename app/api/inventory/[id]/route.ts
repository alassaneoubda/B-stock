import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { AppError, badRequest, handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'

// GET /api/inventory/[id] — Get inventory session with items
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('inventory.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const inventoryId = (await params).id
    if (!isUuid(inventoryId)) throw notFound('Inventaire')

    const sessions = await sql`
      SELECT is2.*, d.name as depot_name, su.full_name as started_by_name
      FROM inventory_sessions is2
      LEFT JOIN depots d ON is2.depot_id = d.id
      LEFT JOIN users su ON is2.started_by = su.id
      WHERE is2.id = ${inventoryId} AND is2.company_id = ${companyId}
    `
    if (sessions.length === 0) throw notFound('Inventaire')

    const items = await sql`
      SELECT ii.*,
        p.name as product_name, pt_pkg.name as packaging_name,
        pv.price as variant_price, pt_var.name as variant_packaging
      FROM inventory_items ii
      LEFT JOIN product_variants pv ON ii.product_variant_id = pv.id
      LEFT JOIN products p ON pv.product_id = p.id
      LEFT JOIN packaging_types pt_var ON pv.packaging_type_id = pt_var.id
      LEFT JOIN packaging_types pt_pkg ON ii.packaging_type_id = pt_pkg.id
      WHERE ii.inventory_session_id = ${inventoryId}
      ORDER BY ii.item_type, p.name, pt_var.name, pt_pkg.name, ii.id
    `

    return NextResponse.json({ success: true, data: { session: sessions[0], items } })
  } catch (error) {
    return handleRouteError(error, 'inventory.detail')
  }
}

const updateSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        // null = pas encore compté
        counted_quantity: z.number().int().nonnegative().nullable(),
        notes: z.string().max(1000).nullish(),
      })
    )
    .default([]),
})

// PUT /api/inventory/[id] — Update counted quantities
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('inventory.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const inventoryId = (await params).id
    if (!isUuid(inventoryId)) throw notFound('Inventaire')

    const { items } = updateSchema.parse(await request.json())

    const ids = items.map((i) => i.id)
    if (new Set(ids).size !== ids.length) {
      throw badRequest("Une même ligne d'inventaire apparaît plusieurs fois")
    }

    await withTransaction(async (tx) => {
      // Verrou : une finalisation concurrente attend la fin de cette saisie (et inversement).
      const [session] = await tx.sql<{ status: string }>`
        SELECT status FROM inventory_sessions
        WHERE id = ${inventoryId} AND company_id = ${companyId}
        FOR UPDATE
      `
      if (!session) throw notFound('Inventaire')
      if (session.status !== 'in_progress') {
        throw new AppError(409, 'Inventaire déjà finalisé', 'INVALID_STATUS')
      }
      if (items.length === 0) return

      const counts = items.map((i) => i.counted_quantity)
      const notes = items.map((i) => i.notes || null)

      const { rowCount } = await tx.exec`
        UPDATE inventory_items ii SET
          counted_quantity = v.counted,
          notes = COALESCE(v.notes, ii.notes),
          counted_by = CASE WHEN v.counted IS NULL THEN NULL ELSE ${userId}::uuid END,
          counted_at = CASE WHEN v.counted IS NULL THEN NULL ELSE NOW() END
        FROM unnest(${ids}::uuid[], ${counts}::int[], ${notes}::text[]) AS v(id, counted, notes)
        WHERE ii.id = v.id AND ii.inventory_session_id = ${inventoryId}
      `
      if (rowCount !== ids.length) throw notFound("Ligne d'inventaire")
    })

    return NextResponse.json({ success: true, message: 'Quantités mises à jour' })
  } catch (error) {
    return handleRouteError(error, 'inventory.update')
  }
}
