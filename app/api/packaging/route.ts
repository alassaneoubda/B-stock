import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'

const packagingSchema = z.object({
    name: z.string().trim().min(1, 'Le nom est requis').max(100),
    unitsPerCase: z.number().int().min(1).default(1),
    isReturnable: z.boolean().default(true),
    depositPrice: z.number().min(0).default(0),
})

/** ?limit (défaut 500 : alimente des listes déroulantes, max 500) / ?offset */
function parsePage(searchParams: URLSearchParams, defaultLimit = 500) {
    const limit = Number.parseInt(searchParams.get('limit') ?? '', 10)
    const offset = Number.parseInt(searchParams.get('offset') ?? '', 10)
    return {
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : defaultLimit,
        offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
    }
}

export async function GET(request: NextRequest) {
    try {
        const authz = await requirePermission('packaging.read')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { limit, offset } = parsePage(new URL(request.url).searchParams)
        const packagingTypes = await sql`
            SELECT * FROM packaging_types
            WHERE company_id = ${companyId}
            ORDER BY name ASC, id
            LIMIT ${limit} OFFSET ${offset}
        `

        // `packagingTypes` : alias lu par certains écrans (chargement véhicule, équivalences)
        return NextResponse.json({ success: true, data: packagingTypes, packagingTypes })
    } catch (error) {
        return handleRouteError(error, 'packaging.list')
    }
}

export async function POST(request: NextRequest) {
    try {
        const authz = await requirePermission('packaging.write')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const data = packagingSchema.parse(await request.json())

        const [packagingType] = await sql`
            INSERT INTO packaging_types (
                company_id, name, units_per_case, is_returnable, deposit_price
            ) VALUES (
                ${companyId}, ${data.name}, ${data.unitsPerCase},
                ${data.isReturnable}, ${data.depositPrice}
            )
            RETURNING *
        `

        return NextResponse.json({ packagingType }, { status: 201 })
    } catch (error) {
        return handleRouteError(error, 'packaging.create')
    }
}
