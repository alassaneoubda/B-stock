import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { badRequest, conflict, handleRouteError, notFound } from '@/lib/errors'
import { assertOwned, isUuid } from '@/lib/tenant'

const equivalenceSchema = z.object({
    packagingTypeA: z.string().uuid(),
    packagingTypeB: z.string().uuid(),
})

/** ?limit (défaut 500, max 500) / ?offset */
function parsePage(searchParams: URLSearchParams, defaultLimit = 500) {
    const limit = Number.parseInt(searchParams.get('limit') ?? '', 10)
    const offset = Number.parseInt(searchParams.get('offset') ?? '', 10)
    return {
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : defaultLimit,
        offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
    }
}

// GET /api/packaging/equivalences — List all equivalences
export async function GET(request: NextRequest) {
    try {
        const authz = await requirePermission('packaging.read')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { limit, offset } = parsePage(new URL(request.url).searchParams)
        const equivalences = await sql`
            SELECT pe.id, pe.packaging_type_a, pe.packaging_type_b, pe.created_at,
                   pta.name AS name_a, pta.units_per_case AS units_a,
                   ptb.name AS name_b, ptb.units_per_case AS units_b
            FROM packaging_equivalences pe
            JOIN packaging_types pta ON pe.packaging_type_a = pta.id AND pta.company_id = ${companyId}
            JOIN packaging_types ptb ON pe.packaging_type_b = ptb.id AND ptb.company_id = ${companyId}
            WHERE pe.company_id = ${companyId}
            ORDER BY pta.name, ptb.name, pe.id
            LIMIT ${limit} OFFSET ${offset}
        `

        return NextResponse.json({ success: true, data: equivalences })
    } catch (error) {
        return handleRouteError(error, 'packaging.equivalences.list')
    }
}

// POST /api/packaging/equivalences — Create a new equivalence
export async function POST(request: NextRequest) {
    try {
        const authz = await requirePermission('packaging.write')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const data = equivalenceSchema.parse(await request.json())
        if (data.packagingTypeA === data.packagingTypeB) {
            throw badRequest('Les deux emballages doivent être différents')
        }

        const created = await withTransaction(async (tx) => {
            await assertOwned(tx.sql, companyId, {
                packagingTypes: [data.packagingTypeA, data.packagingTypeB],
            })

            // Sérialise les créations concurrentes de la même paire (dans les deux sens)
            const [a, b] = [data.packagingTypeA, data.packagingTypeB].sort()
            await tx.sql`SELECT pg_advisory_xact_lock(hashtext(${`${companyId}:pkg-equiv:${a}:${b}`}))`

            const existing = await tx.sql`
                SELECT id FROM packaging_equivalences
                WHERE company_id = ${companyId}
                  AND (
                    (packaging_type_a = ${data.packagingTypeA} AND packaging_type_b = ${data.packagingTypeB})
                    OR (packaging_type_a = ${data.packagingTypeB} AND packaging_type_b = ${data.packagingTypeA})
                  )
            `
            if (existing.length > 0) throw conflict('Cette équivalence existe déjà')

            const [row] = await tx.sql`
                INSERT INTO packaging_equivalences (packaging_type_a, packaging_type_b, company_id)
                VALUES (${data.packagingTypeA}, ${data.packagingTypeB}, ${companyId})
                RETURNING *
            `
            return row
        })

        return NextResponse.json(
            { success: true, data: created, message: 'Équivalence créée avec succès' },
            { status: 201 }
        )
    } catch (error) {
        return handleRouteError(error, 'packaging.equivalences.create')
    }
}

// DELETE /api/packaging/equivalences?id=… — Delete an equivalence
export async function DELETE(request: NextRequest) {
    try {
        const authz = await requirePermission('packaging.write')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const equivalenceId = new URL(request.url).searchParams.get('id')
        if (!equivalenceId) throw badRequest('ID requis')
        if (!isUuid(equivalenceId)) throw notFound('Équivalence')

        const result = await sql`
            DELETE FROM packaging_equivalences
            WHERE id = ${equivalenceId} AND company_id = ${companyId}
            RETURNING id
        `
        if (result.length === 0) throw notFound('Équivalence')

        return NextResponse.json({ success: true, message: 'Équivalence supprimée' })
    } catch (error) {
        return handleRouteError(error, 'packaging.equivalences.delete')
    }
}
