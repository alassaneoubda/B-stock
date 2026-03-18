import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

const returnSchema = z.object({
    items: z.array(z.object({
        productVariantId: z.string().uuid(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().min(0),
    })),
    reason: z.string().optional(),
})

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
        const data = returnSchema.parse(body)
        const { companyId } = session.user

        // 1. Get procurement details
        const orders = await sql`
            SELECT supplier_id, depot_id FROM purchase_orders
            WHERE id = ${id} AND company_id = ${companyId}
        `
        if (orders.length === 0) {
            return NextResponse.json({ error: 'Approvisionnement introuvable' }, { status: 404 })
        }
        const { depot_id: depotId } = orders[0]

        // 2. Process returns
        for (const item of data.items) {
            // Check stock level first
            const stock = await sql`
                SELECT quantity FROM stock 
                WHERE depot_id = ${depotId} AND product_variant_id = ${item.productVariantId}
            `
            const currentQty = stock.length > 0 ? Number(stock[0].quantity) : 0
            if (currentQty < item.quantity) {
                return NextResponse.json({
                    error: `Stock insuffisant pour effectuer le retour de ce produit. Stock actuel: ${currentQty}`
                }, { status: 400 })
            }

            // Decrease stock
            await sql`
                UPDATE stock
                SET quantity = quantity - ${item.quantity}, updated_at = NOW()
                WHERE depot_id = ${depotId} AND product_variant_id = ${item.productVariantId}
            `

            // Record movement
            await sql`
                INSERT INTO stock_movements (
                    company_id, depot_id, product_variant_id,
                    movement_type, quantity, reference_type, reference_id,
                    notes, created_by
                ) VALUES (
                    ${companyId}, ${depotId}, ${item.productVariantId},
                    'return', ${-item.quantity}, 'purchase_order', ${id},
                    ${data.reason || 'Retour fournisseur'}, ${session.user.id}
                )
            `
        }

        return NextResponse.json({
            success: true,
            message: 'Retour fournisseur enregistré avec succès'
        })

    } catch (error) {
        console.error('Error processing procurement return:', error)
        return NextResponse.json({ error: 'Erreur lors du traitement du retour' }, { status: 500 })
    }
}
