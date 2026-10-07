import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction, type Tx } from '@/lib/db'
import { conflict, handleRouteError, notFound } from '@/lib/errors'
import { assertOwned, isUuid } from '@/lib/tenant'

// NB : le chargement (loaded) et le déchargement (unloaded/returned/damaged)
// du véhicule n'ont volontairement AUCUN effet sur le stock des dépôts dans
// cette version : c'est une décision produit à prendre plus tard (sortie au
// chargement ou à la livraison ? retour au déchargement ?). Le jour venu,
// passer exclusivement par lib/domain/stock.ts.

const inventorySchema = z
    .object({
        productVariantId: z.string().uuid().optional().nullable(),
        packagingTypeId: z.string().uuid().optional().nullable(),
        inventoryType: z.enum(['product', 'packaging']),
        loadedQuantity: z.number().int().min(0).default(0),
    })
    .refine((d) => (d.inventoryType === 'product' ? !!d.productVariantId : !!d.packagingTypeId), {
        message: 'Produit ou emballage requis selon le type',
        path: ['inventoryType'],
    })

const inventoryUpdateSchema = z.object({
    inventoryItemId: z.string().uuid(),
    unloadedQuantity: z.number().int().min(0).optional(),
    returnedQuantity: z.number().int().min(0).optional(),
    damagedQuantity: z.number().int().min(0).optional(),
})

type Params = { params: Promise<{ id: string }> }

/** Verrouille la tournée ; refuse toute modification d'une tournée terminée ou annulée. */
async function lockOpenTour(tx: Tx, tourId: string, companyId: string) {
    const [tour] = await tx.sql`
        SELECT id, status FROM delivery_tours
        WHERE id = ${tourId} AND company_id = ${companyId}
        FOR UPDATE
    `
    if (!tour) throw notFound('Tournée')
    if (tour.status === 'completed' || tour.status === 'cancelled') {
        throw conflict("Impossible de modifier l'inventaire d'une tournée terminée ou annulée", 'TOUR_CLOSED')
    }
}

// GET /api/deliveries/[id]/inventory
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

        return NextResponse.json({ success: true, data: inventory })
    } catch (error) {
        return handleRouteError(error, 'deliveries.inventory.list')
    }
}

// POST /api/deliveries/[id]/inventory — Add item to vehicle inventory (loading)
export async function POST(request: NextRequest, { params }: Params) {
    try {
        const authz = await requirePermission('deliveries.write')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { id } = await params
        if (!isUuid(id)) throw notFound('Tournée')
        const data = inventorySchema.parse(await request.json())

        const item = await withTransaction(async (tx) => {
            await lockOpenTour(tx, id, companyId)
            await assertOwned(tx.sql, companyId, {
                variants: [data.productVariantId],
                packagingTypes: [data.packagingTypeId],
            })

            const [row] = await tx.sql`
                INSERT INTO vehicle_inventory (
                    delivery_tour_id, product_variant_id, packaging_type_id,
                    inventory_type, loaded_quantity
                ) VALUES (
                    ${id}, ${data.productVariantId || null}, ${data.packagingTypeId || null},
                    ${data.inventoryType}, ${data.loadedQuantity}
                )
                RETURNING *
            `
            return row
        })

        return NextResponse.json({ success: true, data: item, message: 'Article chargé' }, { status: 201 })
    } catch (error) {
        return handleRouteError(error, 'deliveries.inventory.create')
    }
}

// PATCH /api/deliveries/[id]/inventory — Update unloaded/returned/damaged quantities
export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const authz = await requirePermission('deliveries.write')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { id } = await params
        if (!isUuid(id)) throw notFound('Tournée')
        const data = inventoryUpdateSchema.parse(await request.json())

        const item = await withTransaction(async (tx) => {
            await lockOpenTour(tx, id, companyId)
            const [row] = await tx.sql`
                UPDATE vehicle_inventory SET
                    unloaded_quantity = COALESCE(${data.unloadedQuantity ?? null}, unloaded_quantity),
                    returned_quantity = COALESCE(${data.returnedQuantity ?? null}, returned_quantity),
                    damaged_quantity = COALESCE(${data.damagedQuantity ?? null}, damaged_quantity)
                WHERE id = ${data.inventoryItemId} AND delivery_tour_id = ${id}
                RETURNING *
            `
            if (!row) throw notFound('Article')
            return row
        })

        return NextResponse.json({ success: true, data: item, message: 'Inventaire mis à jour' })
    } catch (error) {
        return handleRouteError(error, 'deliveries.inventory.update')
    }
}
