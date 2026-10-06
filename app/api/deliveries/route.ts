import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'

const deliveryTourSchema = z.object({
    tourDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'La date est requise'),
    driverName: z.string().trim().min(1, 'Le nom du chauffeur est requis').max(255),
    vehicleId: z.string().uuid().optional().nullable(),
    depotId: z.string().uuid().optional().nullable(),
    notes: z.string().max(5000).optional(),
})

/** ?limit (défaut 100, max 500) / ?offset */
function parsePage(searchParams: URLSearchParams, defaultLimit = 100) {
    const limit = Number.parseInt(searchParams.get('limit') ?? '', 10)
    const offset = Number.parseInt(searchParams.get('offset') ?? '', 10)
    return {
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : defaultLimit,
        offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
    }
}

// GET /api/deliveries — List delivery tours
export async function GET(request: NextRequest) {
    try {
        const authz = await requirePermission('deliveries.read')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { limit, offset } = parsePage(new URL(request.url).searchParams)

        // Jointures restreintes à l'entreprise : une référence étrangère (données
        // historiques) ne doit jamais faire remonter les données d'un autre tenant.
        const tours = await sql`
            SELECT
                dt.*,
                v.plate_number AS vehicle_plate,
                d.name AS depot_name,
                u.full_name AS created_by_name
            FROM delivery_tours dt
            LEFT JOIN vehicles v ON dt.vehicle_id = v.id AND v.company_id = dt.company_id
            LEFT JOIN depots d ON dt.depot_id = d.id AND d.company_id = dt.company_id
            LEFT JOIN users u ON dt.created_by = u.id AND u.company_id = dt.company_id
            WHERE dt.company_id = ${companyId}
            ORDER BY dt.tour_date DESC, dt.created_at DESC, dt.id
            LIMIT ${limit} OFFSET ${offset}
        `

        return NextResponse.json({ success: true, data: tours })
    } catch (error) {
        return handleRouteError(error, 'deliveries.list')
    }
}

// POST /api/deliveries — Create a new delivery tour
export async function POST(request: NextRequest) {
    try {
        const authz = await requirePermission('deliveries.write')
        if (!authz.ok) return authz.response
        const { companyId, userId } = authz

        const data = deliveryTourSchema.parse(await request.json())

        const tour = await withTransaction(async (tx) => {
            await assertOwned(tx.sql, companyId, {
                vehicles: [data.vehicleId],
                depots: [data.depotId],
            })

            const [row] = await tx.sql`
                INSERT INTO delivery_tours (
                    company_id, vehicle_id, depot_id, tour_date,
                    driver_name, notes, created_by
                ) VALUES (
                    ${companyId}, ${data.vehicleId || null}, ${data.depotId || null},
                    ${data.tourDate}, ${data.driverName}, ${data.notes || null}, ${userId}
                )
                RETURNING *
            `
            return row
        })

        return NextResponse.json(
            { success: true, data: tour, message: 'Tournée de livraison créée avec succès' },
            { status: 201 }
        )
    } catch (error) {
        return handleRouteError(error, 'deliveries.create')
    }
}
