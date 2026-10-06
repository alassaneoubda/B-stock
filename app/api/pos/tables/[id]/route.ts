import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'

type Params = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  area: z.string().trim().max(50).nullable().optional(),
  seats: z.number().int().min(1).max(100).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
})

// PATCH /api/pos/tables/[id]
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const authz = await requirePermission('pos.manage')
    if (!authz.ok) return authz.response
    const { id } = await params
    if (!isUuid(id)) throw notFound('Table')
    const d = updateSchema.parse(await request.json())
    // Champ par champ : un champ absent est conservé, un champ à null est vidé
    const [table] = await sql`
      UPDATE pos_tables SET
        name = COALESCE(${d.name ?? null}, name),
        area = CASE WHEN ${d.area !== undefined} THEN ${d.area ?? null} ELSE area END,
        seats = CASE WHEN ${d.seats !== undefined} THEN ${d.seats ?? null}::int ELSE seats END,
        sort_order = COALESCE(${d.sortOrder ?? null}::int, sort_order),
        updated_at = NOW()
      WHERE id = ${id} AND company_id = ${authz.companyId} AND is_active = true
      RETURNING id, name, area, seats, sort_order
    `
    if (!table) throw notFound('Table')
    return NextResponse.json({ success: true, data: table })
  } catch (error) {
    return handleRouteError(error, 'pos.tables.update')
  }
}

// DELETE /api/pos/tables/[id] — retire la table (refusé si un ticket y est ouvert)
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const authz = await requirePermission('pos.manage')
    if (!authz.ok) return authz.response
    const { id } = await params
    if (!isUuid(id)) throw notFound('Table')
    const [busy] = await sql`SELECT 1 FROM pos_orders WHERE table_id = ${id} AND status = 'open' AND company_id = ${authz.companyId}`
    if (busy) throw new AppError(409, 'Un ticket est ouvert sur cette table : encaissez-le ou transférez-le d’abord', 'TABLE_BUSY')
    const [row] = await sql`
      UPDATE pos_tables SET is_active = false, updated_at = NOW()
      WHERE id = ${id} AND company_id = ${authz.companyId} AND is_active = true
      RETURNING id
    `
    if (!row) throw notFound('Table')
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'pos.tables.delete')
  }
}
