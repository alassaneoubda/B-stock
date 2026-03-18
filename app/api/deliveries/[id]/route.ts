import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/deliveries/[id] — Get tour detail with stops and inventory
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const { id } = await params

        const tours = await sql`
            SELECT dt.*,
                   v.name as vehicle_name, v.plate_number as vehicle_plate,
                   d.name as depot_name,
                   u.full_name as created_by_name
            FROM delivery_tours dt
            LEFT JOIN vehicles v ON dt.vehicle_id = v.id
            LEFT JOIN depots d ON dt.depot_id = d.id
            LEFT JOIN users u ON dt.created_by = u.id
            WHERE dt.id = ${id} AND dt.company_id = ${session.user.companyId}
        `

        if (tours.length === 0) {
            return NextResponse.json({ error: 'Tournée introuvable' }, { status: 404 })
        }

        const stops = await sql`
            SELECT ts.*,
                   c.name as client_name, c.address as client_address,
                   c.phone as client_phone, c.zone as client_zone,
                   so.order_number, so.total_amount, so.paid_amount
            FROM tour_stops ts
            LEFT JOIN clients c ON ts.client_id = c.id
            LEFT JOIN sales_orders so ON ts.sales_order_id = so.id
            WHERE ts.delivery_tour_id = ${id}
            ORDER BY ts.stop_order ASC
        `

        const inventory = await sql`
            SELECT vi.*,
                   p.name as product_name,
                   pt.name as packaging_name,
                   pv.price as variant_price
            FROM vehicle_inventory vi
            LEFT JOIN product_variants pv ON vi.product_variant_id = pv.id
            LEFT JOIN products p ON pv.product_id = p.id
            LEFT JOIN packaging_types pt ON COALESCE(vi.packaging_type_id, pv.packaging_type_id) = pt.id
            WHERE vi.delivery_tour_id = ${id}
            ORDER BY vi.inventory_type, p.name
        `

        return NextResponse.json({
            success: true,
            data: {
                ...tours[0],
                stops,
                inventory,
            },
        })
    } catch (error) {
        console.error('Error fetching tour detail:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

const tourUpdateSchema = z.object({
    status: z.enum(['planned', 'loading', 'in_progress', 'completed', 'cancelled']).optional(),
    driverName: z.string().optional(),
    vehicleId: z.string().uuid().optional().nullable(),
    notes: z.string().optional(),
})

// PATCH /api/deliveries/[id] — Update tour status/details
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const { id } = await params
        const body = await request.json()
        const data = tourUpdateSchema.parse(body)

        const existing = await sql`
            SELECT id, status FROM delivery_tours
            WHERE id = ${id} AND company_id = ${session.user.companyId}
        `
        if (existing.length === 0) {
            return NextResponse.json({ error: 'Tournée introuvable' }, { status: 404 })
        }

        // Handle status transitions with timestamps
        let startedAt = null
        let completedAt = null
        if (data.status === 'in_progress' && existing[0].status !== 'in_progress') {
            startedAt = new Date().toISOString()
        }
        if (data.status === 'completed') {
            completedAt = new Date().toISOString()
        }

        const result = await sql`
            UPDATE delivery_tours SET
                status = COALESCE(${data.status ?? null}, status),
                driver_name = COALESCE(${data.driverName ?? null}, driver_name),
                vehicle_id = COALESCE(${data.vehicleId ?? null}, vehicle_id),
                notes = COALESCE(${data.notes ?? null}, notes),
                started_at = COALESCE(${startedAt}, started_at),
                completed_at = COALESCE(${completedAt}, completed_at)
            WHERE id = ${id}
            RETURNING *
        `

        return NextResponse.json({
            success: true,
            data: result[0],
            message: 'Tournée mise à jour',
        })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error updating tour:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
