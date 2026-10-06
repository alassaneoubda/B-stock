import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction, type Tx } from '@/lib/db'
import { badRequest, conflict, handleRouteError, notFound } from '@/lib/errors'
import { assertOwned, isUuid } from '@/lib/tenant'

const stopSchema = z.object({
    salesOrderId: z.string().uuid().optional().nullable(),
    clientId: z.string().uuid(),
    stopOrder: z.number().int().min(1),
    notes: z.string().max(5000).optional(),
})

const stopUpdateSchema = z.object({
    stopId: z.string({ required_error: 'stopId requis' }).uuid(),
    status: z.enum(['pending', 'delivered', 'partial', 'failed']).optional(),
    stopOrder: z.number().int().min(1).optional(),
    notes: z.string().max(5000).optional(),
})

/** Statuts de commande qui passent à « delivered » quand l'arrêt est livré. */
const DELIVERABLE_ORDER_STATUSES = ['confirmed', 'preparing', 'ready']

type Params = { params: Promise<{ id: string }> }

/** Verrouille la tournée (appartenance + statut) ; refuse les tournées finales. */
async function lockOpenTour(tx: Tx, tourId: string, companyId: string) {
    const [tour] = await tx.sql`
        SELECT id, status FROM delivery_tours
        WHERE id = ${tourId} AND company_id = ${companyId}
        FOR UPDATE
    `
    if (!tour) throw notFound('Tournée')
    if (tour.status === 'completed' || tour.status === 'cancelled') {
        throw conflict('Impossible de modifier une tournée terminée ou annulée', 'TOUR_CLOSED')
    }
    return tour
}

// GET /api/deliveries/[id]/stops
export async function GET(_request: NextRequest, { params }: Params) {
    try {
        const authz = await requirePermission('deliveries.read')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { id } = await params
        if (!isUuid(id)) throw notFound('Tournée')

        const tour = await sql`
            SELECT id FROM delivery_tours WHERE id = ${id} AND company_id = ${companyId}
        `
        if (tour.length === 0) throw notFound('Tournée')

        const stops = await sql`
            SELECT ts.*,
                   c.name AS client_name, c.address AS client_address,
                   c.phone AS client_phone, c.zone AS client_zone,
                   so.order_number, so.total_amount, so.paid_amount
            FROM tour_stops ts
            LEFT JOIN clients c ON ts.client_id = c.id AND c.company_id = ${companyId}
            LEFT JOIN sales_orders so ON ts.sales_order_id = so.id AND so.company_id = ${companyId}
            WHERE ts.delivery_tour_id = ${id}
            ORDER BY ts.stop_order ASC
        `

        return NextResponse.json({ success: true, data: stops })
    } catch (error) {
        return handleRouteError(error, 'deliveries.stops.list')
    }
}

// POST /api/deliveries/[id]/stops — Add a stop
export async function POST(request: NextRequest, { params }: Params) {
    try {
        const authz = await requirePermission('deliveries.write')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { id } = await params
        if (!isUuid(id)) throw notFound('Tournée')
        const data = stopSchema.parse(await request.json())

        const stop = await withTransaction(async (tx) => {
            await lockOpenTour(tx, id, companyId)
            await assertOwned(tx.sql, companyId, {
                clients: [data.clientId],
                salesOrders: [data.salesOrderId],
            })

            if (data.salesOrderId) {
                const [order] = await tx.sql`
                    SELECT client_id FROM sales_orders
                    WHERE id = ${data.salesOrderId} AND company_id = ${companyId}
                `
                if (order.client_id && order.client_id !== data.clientId) {
                    throw badRequest("La commande n'appartient pas à ce client")
                }
            }

            const [row] = await tx.sql`
                INSERT INTO tour_stops (delivery_tour_id, sales_order_id, client_id, stop_order, notes)
                VALUES (${id}, ${data.salesOrderId || null}, ${data.clientId}, ${data.stopOrder}, ${data.notes || null})
                RETURNING *
            `
            return row
        })

        return NextResponse.json({ success: true, data: stop, message: 'Arrêt ajouté' }, { status: 201 })
    } catch (error) {
        return handleRouteError(error, 'deliveries.stops.create')
    }
}

// PATCH /api/deliveries/[id]/stops — Update a stop (stopId in body)
export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const authz = await requirePermission('deliveries.write')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { id } = await params
        if (!isUuid(id)) throw notFound('Tournée')
        const data = stopUpdateSchema.parse(await request.json())

        const stop = await withTransaction(async (tx) => {
            await lockOpenTour(tx, id, companyId)

            const [current] = await tx.sql`
                SELECT id, status, sales_order_id FROM tour_stops
                WHERE id = ${data.stopId} AND delivery_tour_id = ${id}
                FOR UPDATE
            `
            if (!current) throw notFound('Arrêt')

            const becomesDelivered = data.status === 'delivered' && current.status !== 'delivered'

            const [row] = await tx.sql`
                UPDATE tour_stops SET
                    status = COALESCE(${data.status ?? null}, status),
                    stop_order = COALESCE(${data.stopOrder ?? null}, stop_order),
                    notes = COALESCE(${data.notes ?? null}, notes),
                    delivered_at = CASE WHEN ${becomesDelivered}::boolean THEN NOW() ELSE delivered_at END
                WHERE id = ${data.stopId} AND delivery_tour_id = ${id}
                RETURNING *
            `

            // Arrêt livré -> la commande liée passe « livrée » (seulement depuis un statut ouvert)
            if (becomesDelivered && current.sales_order_id) {
                await tx.sql`
                    UPDATE sales_orders SET status = 'delivered', updated_at = NOW()
                    WHERE id = ${current.sales_order_id}
                      AND company_id = ${companyId}
                      AND status = ANY(${DELIVERABLE_ORDER_STATUSES}::text[])
                `
            }
            return row
        })

        return NextResponse.json({ success: true, data: stop, message: 'Arrêt mis à jour' })
    } catch (error) {
        return handleRouteError(error, 'deliveries.stops.update')
    }
}

// DELETE /api/deliveries/[id]/stops?stopId=… — Remove a stop
export async function DELETE(request: NextRequest, { params }: Params) {
    try {
        const authz = await requirePermission('deliveries.write')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { id } = await params
        if (!isUuid(id)) throw notFound('Tournée')
        const stopId = new URL(request.url).searchParams.get('stopId')
        if (!stopId) throw badRequest('stopId requis')
        if (!isUuid(stopId)) throw notFound('Arrêt')

        await withTransaction(async (tx) => {
            await lockOpenTour(tx, id, companyId)
            const { rowCount } = await tx.exec`
                DELETE FROM tour_stops WHERE id = ${stopId} AND delivery_tour_id = ${id}
            `
            if (rowCount !== 1) throw notFound('Arrêt')
        })

        return NextResponse.json({ success: true, message: 'Arrêt supprimé' })
    } catch (error) {
        return handleRouteError(error, 'deliveries.stops.delete')
    }
}
