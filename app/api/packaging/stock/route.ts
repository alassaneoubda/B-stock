import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'

/** ?limit (défaut 500 : alimente des écrans sans pagination, max 500) / ?offset */
function parsePage(searchParams: URLSearchParams, defaultLimit = 500) {
    const limit = Number.parseInt(searchParams.get('limit') ?? '', 10)
    const offset = Number.parseInt(searchParams.get('offset') ?? '', 10)
    return {
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : defaultLimit,
        offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
    }
}

// GET /api/packaging/stock — List packaging stock with depot info
export async function GET(request: NextRequest) {
    try {
        const authz = await requirePermission('packaging.read')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { searchParams } = new URL(request.url)
        const depotId = searchParams.get('depotId') || null
        if (depotId && !isUuid(depotId)) throw notFound('Dépôt')
        const { limit, offset } = parsePage(searchParams)

        const stock = await sql`
            SELECT ps.*, pt.name AS packaging_name, pt.units_per_case,
                   pt.is_returnable, pt.deposit_price, d.name AS depot_name
            FROM packaging_stock ps
            JOIN packaging_types pt ON ps.packaging_type_id = pt.id AND pt.company_id = ${companyId}
            JOIN depots d ON ps.depot_id = d.id
            WHERE d.company_id = ${companyId}
              AND (${depotId}::uuid IS NULL OR ps.depot_id = ${depotId}::uuid)
            ORDER BY d.name, pt.name, ps.id
            LIMIT ${limit} OFFSET ${offset}
        `

        return NextResponse.json({ success: true, data: stock })
    } catch (error) {
        return handleRouteError(error, 'packaging.stock.list')
    }
}
