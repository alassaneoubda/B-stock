import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

const stopSchema = z.object({
    salesOrderId: z.string().uuid().optional().nullable(),
    clientId: z.string().uuid(),
    stopOrder: z.number().int().min(1),
    notes: z.string().optional(),
})

const stopUpdateSchema = z.object({
    status: z.enum(['pending', 'delivered', 'partial', 'failed']).optional(),
    stopOrder: z.number().int().min(1).optional(),
    notes: z.string().optional(),
})

// GET /api/deliveries/[id]/stops
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

        // Verify tour belongs to company
        const tour = await sql`
            SELECT id FROM delivery_tours WHERE id = ${id} AND company_id = ${session.user.companyId}
        `
        if (tour.length === 0) {
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

        return NextResponse.json({ success: true, data: stops })
    } catch (error) {
        console.error('Error fetching stops:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

// POST /api/deliveries/[id]/stops — Add a stop
export async function POST(
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
        const data = stopSchema.parse(body)

        // Verify tour belongs to company
        const tour = await sql`
            SELECT id, status FROM delivery_tours WHERE id = ${id} AND company_id = ${session.user.companyId}
        `
        if (tour.length === 0) {
            return NextResponse.json({ error: 'Tournée introuvable' }, { status: 404 })
        }
        if (tour[0].status === 'completed' || tour[0].status === 'cancelled') {
            return NextResponse.json({ error: 'Impossible de modifier une tournée terminée ou annulée' }, { status: 400 })
        }

        const result = await sql`
            INSERT INTO tour_stops (delivery_tour_id, sales_order_id, client_id, stop_order, notes)
            VALUES (${id}, ${data.salesOrderId || null}, ${data.clientId}, ${data.stopOrder}, ${data.notes || null})
            RETURNING *
        `

        return NextResponse.json({
            success: true,
            data: result[0],
            message: 'Arrêt ajouté',
        }, { status: 201 })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error adding stop:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

// PATCH /api/deliveries/[id]/stops — Update a stop (pass stopId in body)
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
        const { stopId, ...updateData } = body
        const data = stopUpdateSchema.parse(updateData)

        if (!stopId) {
            return NextResponse.json({ error: 'stopId requis' }, { status: 400 })
        }

        // Verify tour belongs to company
        const tour = await sql`
            SELECT id FROM delivery_tours WHERE id = ${id} AND company_id = ${session.user.companyId}
        `
        if (tour.length === 0) {
            return NextResponse.json({ error: 'Tournée introuvable' }, { status: 404 })
        }

        const deliveredAt = data.status === 'delivered' ? new Date().toISOString() : null

        const result = await sql`
            UPDATE tour_stops SET
                status = COALESCE(${data.status ?? null}, status),
                stop_order = COALESCE(${data.stopOrder ?? null}, stop_order),
                notes = COALESCE(${data.notes ?? null}, notes),
                delivered_at = COALESCE(${deliveredAt}, delivered_at)
            WHERE id = ${stopId} AND delivery_tour_id = ${id}
            RETURNING *
        `

        if (result.length === 0) {
            return NextResponse.json({ error: 'Arrêt introuvable' }, { status: 404 })
        }

        return NextResponse.json({
            success: true,
            data: result[0],
            message: 'Arrêt mis à jour',
        })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error updating stop:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

// DELETE /api/deliveries/[id]/stops — Remove a stop (pass stopId as query param)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const { id } = await params
        const { searchParams } = new URL(request.url)
        const stopId = searchParams.get('stopId')

        if (!stopId) {
            return NextResponse.json({ error: 'stopId requis' }, { status: 400 })
        }

        const tour = await sql`
            SELECT id, status FROM delivery_tours WHERE id = ${id} AND company_id = ${session.user.companyId}
        `
        if (tour.length === 0) {
            return NextResponse.json({ error: 'Tournée introuvable' }, { status: 404 })
        }
        if (tour[0].status === 'completed' || tour[0].status === 'cancelled') {
            return NextResponse.json({ error: 'Impossible de modifier une tournée terminée ou annulée' }, { status: 400 })
        }

        const result = await sql`
            DELETE FROM tour_stops WHERE id = ${stopId} AND delivery_tour_id = ${id} RETURNING id
        `
        if (result.length === 0) {
            return NextResponse.json({ error: 'Arrêt introuvable' }, { status: 404 })
        }

        return NextResponse.json({ success: true, message: 'Arrêt supprimé' })
    } catch (error) {
        console.error('Error deleting stop:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
