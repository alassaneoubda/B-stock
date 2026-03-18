import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

const inventorySchema = z.object({
    productVariantId: z.string().uuid().optional().nullable(),
    packagingTypeId: z.string().uuid().optional().nullable(),
    inventoryType: z.enum(['product', 'packaging']),
    loadedQuantity: z.number().int().min(0).default(0),
})

const inventoryUpdateSchema = z.object({
    inventoryItemId: z.string().uuid(),
    unloadedQuantity: z.number().int().min(0).optional(),
    returnedQuantity: z.number().int().min(0).optional(),
    damagedQuantity: z.number().int().min(0).optional(),
})

// GET /api/deliveries/[id]/inventory
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

        const tour = await sql`
            SELECT id FROM delivery_tours WHERE id = ${id} AND company_id = ${session.user.companyId}
        `
        if (tour.length === 0) {
            return NextResponse.json({ error: 'Tournée introuvable' }, { status: 404 })
        }

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

        return NextResponse.json({ success: true, data: inventory })
    } catch (error) {
        console.error('Error fetching inventory:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

// POST /api/deliveries/[id]/inventory — Add item to vehicle inventory (loading)
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
        const data = inventorySchema.parse(body)

        const tour = await sql`
            SELECT id, status FROM delivery_tours WHERE id = ${id} AND company_id = ${session.user.companyId}
        `
        if (tour.length === 0) {
            return NextResponse.json({ error: 'Tournée introuvable' }, { status: 404 })
        }
        if (tour[0].status === 'completed' || tour[0].status === 'cancelled') {
            return NextResponse.json({ error: 'Impossible de modifier une tournée terminée' }, { status: 400 })
        }

        const result = await sql`
            INSERT INTO vehicle_inventory (
                delivery_tour_id, product_variant_id, packaging_type_id,
                inventory_type, loaded_quantity
            ) VALUES (
                ${id}, ${data.productVariantId || null}, ${data.packagingTypeId || null},
                ${data.inventoryType}, ${data.loadedQuantity}
            )
            RETURNING *
        `

        return NextResponse.json({
            success: true,
            data: result[0],
            message: 'Article chargé',
        }, { status: 201 })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error adding inventory:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

// PATCH /api/deliveries/[id]/inventory — Update unloaded/returned/damaged quantities
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
        const data = inventoryUpdateSchema.parse(body)

        const tour = await sql`
            SELECT id FROM delivery_tours WHERE id = ${id} AND company_id = ${session.user.companyId}
        `
        if (tour.length === 0) {
            return NextResponse.json({ error: 'Tournée introuvable' }, { status: 404 })
        }

        const result = await sql`
            UPDATE vehicle_inventory SET
                unloaded_quantity = COALESCE(${data.unloadedQuantity ?? null}, unloaded_quantity),
                returned_quantity = COALESCE(${data.returnedQuantity ?? null}, returned_quantity),
                damaged_quantity = COALESCE(${data.damagedQuantity ?? null}, damaged_quantity)
            WHERE id = ${data.inventoryItemId} AND delivery_tour_id = ${id}
            RETURNING *
        `

        if (result.length === 0) {
            return NextResponse.json({ error: 'Article introuvable' }, { status: 404 })
        }

        return NextResponse.json({
            success: true,
            data: result[0],
            message: 'Inventaire mis à jour',
        })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error updating inventory:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
