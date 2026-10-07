import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { conflict, handleRouteError, notFound } from '@/lib/errors'
import { assertOwned, isUuid } from '@/lib/tenant'

type Params = { params: Promise<{ id: string }> }

type TourStatus = 'planned' | 'loading' | 'in_progress' | 'completed' | 'cancelled'

/** Transitions autorisées ; completed et cancelled sont des états finaux. */
const TRANSITIONS: Record<TourStatus, TourStatus[]> = {
    planned: ['loading', 'in_progress', 'cancelled'],
    loading: ['in_progress', 'planned', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
}

const STATUS_LABELS: Record<TourStatus, string> = {
    planned: 'planifiée',
    loading: 'en chargement',
    in_progress: 'en cours',
    completed: 'terminée',
    cancelled: 'annulée',
}

// GET /api/deliveries/[id] — Get tour detail with stops and inventory
export async function GET(_request: NextRequest, { params }: Params) {
    try {
        const authz = await requirePermission('deliveries.read')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { id } = await params
        if (!isUuid(id)) throw notFound('Tournée')

        // Toutes les jointures sont restreintes à l'entreprise : des références
        // étrangères (injectées avant ce correctif) ne doivent plus rien exposer.
        const [tour] = await sql`
            SELECT dt.*,
                   v.name AS vehicle_name, v.plate_number AS vehicle_plate,
                   d.name AS depot_name,
                   u.full_name AS created_by_name
            FROM delivery_tours dt
            LEFT JOIN vehicles v ON dt.vehicle_id = v.id AND v.company_id = dt.company_id
            LEFT JOIN depots d ON dt.depot_id = d.id AND d.company_id = dt.company_id
            LEFT JOIN users u ON dt.created_by = u.id AND u.company_id = dt.company_id
            WHERE dt.id = ${id} AND dt.company_id = ${companyId}
        `
        if (!tour) throw notFound('Tournée')

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

        const inventory = await sql`
            SELECT vi.*,
                   p.name AS product_name,
                   pt.name AS packaging_name,
                   pv.price AS variant_price
            FROM vehicle_inventory vi
            LEFT JOIN (
                product_variants pv
                JOIN products p ON pv.product_id = p.id AND p.company_id = ${companyId}
            ) ON vi.product_variant_id = pv.id
            LEFT JOIN packaging_types pt
                ON COALESCE(vi.packaging_type_id, pv.packaging_type_id) = pt.id
               AND pt.company_id = ${companyId}
            WHERE vi.delivery_tour_id = ${id}
            ORDER BY vi.inventory_type, p.name
        `

        return NextResponse.json({ success: true, data: { ...tour, stops, inventory } })
    } catch (error) {
        return handleRouteError(error, 'deliveries.get')
    }
}

const tourUpdateSchema = z.object({
    status: z.enum(['planned', 'loading', 'in_progress', 'completed', 'cancelled']).optional(),
    driverName: z.string().trim().min(1).max(255).optional(),
    vehicleId: z.string().uuid().optional().nullable(),
    notes: z.string().max(5000).optional(),
})

// PATCH /api/deliveries/[id] — Update tour status/details
export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const authz = await requirePermission('deliveries.write')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { id } = await params
        if (!isUuid(id)) throw notFound('Tournée')
        const data = tourUpdateSchema.parse(await request.json())

        // NB : le chargement / déchargement du véhicule n'a volontairement AUCUN
        // effet sur le stock des dépôts à ce stade (décision produit à venir).
        const tour = await withTransaction(async (tx) => {
            const [current] = await tx.sql`
                SELECT id, status FROM delivery_tours
                WHERE id = ${id} AND company_id = ${companyId}
                FOR UPDATE
            `
            if (!current) throw notFound('Tournée')

            await assertOwned(tx.sql, companyId, { vehicles: [data.vehicleId] })

            const from = current.status as TourStatus
            const to = data.status
            if (to && to !== from && !(TRANSITIONS[from] ?? []).includes(to)) {
                throw conflict(
                    `Transition impossible : une tournée ${STATUS_LABELS[from] ?? from} ne peut pas passer à « ${STATUS_LABELS[to]} »`,
                    'INVALID_TRANSITION'
                )
            }
            const newStatus = to ?? null

            // Garde atomique : le statut ne doit pas avoir changé depuis la lecture
            const { rows, rowCount } = await tx.exec`
                UPDATE delivery_tours SET
                    status = COALESCE(${newStatus}::text, status),
                    driver_name = COALESCE(${data.driverName ?? null}, driver_name),
                    vehicle_id = COALESCE(${data.vehicleId ?? null}::uuid, vehicle_id),
                    notes = COALESCE(${data.notes ?? null}, notes),
                    started_at = CASE WHEN ${newStatus}::text = 'in_progress'
                                      THEN COALESCE(started_at, NOW()) ELSE started_at END,
                    completed_at = CASE WHEN ${newStatus}::text = 'completed'
                                        THEN COALESCE(completed_at, NOW()) ELSE completed_at END
                WHERE id = ${id} AND company_id = ${companyId} AND status = ${from}
                RETURNING *
            `
            if (rowCount !== 1) throw conflict('La tournée a été modifiée entre-temps, veuillez réessayer')
            return rows[0]
        })

        return NextResponse.json({ success: true, data: tour, message: 'Tournée mise à jour' })
    } catch (error) {
        return handleRouteError(error, 'deliveries.update')
    }
}
