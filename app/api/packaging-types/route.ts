import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'

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

        return NextResponse.json({ success: true, data: packagingTypes })
    } catch (error) {
        return handleRouteError(error, 'packaging-types.list')
    }
}
