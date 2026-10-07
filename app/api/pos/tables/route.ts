import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'

const tableSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(50),
  area: z.string().trim().max(50).nullish(),
  seats: z.number().int().min(1).max(100).nullish(),
  depotId: z.string().uuid().nullish(),
})

const bulkSchema = z.object({
  /** Création rapide : « T1 » à « T{count} » */
  prefix: z.string().trim().max(20).default('T'),
  count: z.number().int().min(1).max(100),
  area: z.string().trim().max(50).nullish(),
})

// GET /api/pos/tables — tables actives
export async function GET() {
  try {
    const authz = await requirePermission('pos.use')
    if (!authz.ok) return authz.response
    const tables = await sql`
      SELECT id, name, area, seats, depot_id, sort_order FROM pos_tables
      WHERE company_id = ${authz.companyId} AND is_active = true
      ORDER BY sort_order, name
    `
    return NextResponse.json({ success: true, data: tables })
  } catch (error) {
    return handleRouteError(error, 'pos.tables.list')
  }
}

// POST /api/pos/tables — crée une table, ou une série ({ prefix, count })
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('pos.manage')
    if (!authz.ok) return authz.response
    const body = await request.json()

    const created = await withTransaction(async (tx) => {
      const [{ max }] = await tx.sql`
        SELECT COALESCE(MAX(sort_order), 0)::int AS max FROM pos_tables WHERE company_id = ${authz.companyId}
      `
      if ('count' in body) {
        const data = bulkSchema.parse(body)
        const rows = []
        for (let i = 1; i <= data.count; i++) {
          const [row] = await tx.sql`
            INSERT INTO pos_tables (company_id, name, area, sort_order)
            VALUES (${authz.companyId}, ${`${data.prefix}${i}`}, ${data.area ?? null}, ${max + i})
            ON CONFLICT DO NOTHING
            RETURNING id, name, area, seats, sort_order
          `
          if (row) rows.push(row)
        }
        return rows
      }
      const data = tableSchema.parse(body)
      await assertOwned(tx.sql, authz.companyId, { depots: [data.depotId] })
      const [row] = await tx.sql`
        INSERT INTO pos_tables (company_id, depot_id, name, area, seats, sort_order)
        VALUES (${authz.companyId}, ${data.depotId ?? null}, ${data.name}, ${data.area ?? null}, ${data.seats ?? null}, ${max + 1})
        RETURNING id, name, area, seats, sort_order
      `
      return [row]
    })

    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (error) {
    return handleRouteError(error, 'pos.tables.create')
  }
}
