import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'

const depotSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est requis').max(200),
  address: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  isMain: z.boolean().default(false),
})

const listSchema = z.object({
  // Pagination optionnelle : sans `limit`, tous les dépôts sont renvoyés (listes de sélection).
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('stock.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const q = listSchema.parse({
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
    })

    const depots = await sql`
      SELECT * FROM depots
      WHERE company_id = ${companyId}
      ORDER BY is_main DESC, name ASC, id ASC
      LIMIT ${q.limit ?? null}::int OFFSET ${q.offset}
    `

    return NextResponse.json({ success: true, data: depots })
  } catch (error) {
    return handleRouteError(error, 'depots.list')
  }
}

export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('stock.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const data = depotSchema.parse(await request.json())

    const depot = await withTransaction(async (tx) => {
      // Un seul dépôt principal par entreprise : bascule dans la même transaction.
      if (data.isMain) {
        await tx.sql`UPDATE depots SET is_main = false WHERE company_id = ${companyId} AND is_main = true`
      }

      const [created] = await tx.sql`
        INSERT INTO depots (company_id, name, address, phone, is_main)
        VALUES (${companyId}, ${data.name}, ${data.address || null}, ${data.phone || null}, ${data.isMain})
        RETURNING *
      `

      // Stock d'emballages initialisé à 0 pour chaque type d'emballage de l'entreprise.
      await tx.sql`
        INSERT INTO packaging_stock (depot_id, packaging_type_id, quantity)
        SELECT ${created.id}, pt.id, 0 FROM packaging_types pt WHERE pt.company_id = ${companyId}
        ON CONFLICT (depot_id, packaging_type_id) DO NOTHING
      `

      return created
    })

    return NextResponse.json({ depot }, { status: 201 })
  } catch (error) {
    return handleRouteError(error, 'depots.create')
  }
}
