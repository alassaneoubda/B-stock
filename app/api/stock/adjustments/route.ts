import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

const adjustmentSchema = z.object({
    depotId: z.string().uuid(),
    productVariantId: z.string().uuid(),
    quantity: z.number().int(),
    reason: z.enum(['adjustment', 'damage', 'return', 'transfer']),
    notes: z.string().optional(),
    lotNumber: z.string().optional(),
})

// POST /api/stock/adjustments — Create a stock adjustment
export async function POST(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const body = await request.json()
        const data = adjustmentSchema.parse(body)

        // Verify depot belongs to company
        const depots = await sql`
      SELECT id FROM depots WHERE id = ${data.depotId} AND company_id = ${session.user.companyId}
    `
        if (depots.length === 0) {
            return NextResponse.json({ error: 'Dépôt introuvable' }, { status: 404 })
        }

        // Update stock
        const existingStock = await sql`
      SELECT id, quantity FROM stock
      WHERE depot_id = ${data.depotId} AND product_variant_id = ${data.productVariantId}
      AND (lot_number = ${data.lotNumber || null} OR (lot_number IS NULL AND ${data.lotNumber || null} IS NULL))
    `

        if (existingStock.length > 0) {
            const newQty = Number(existingStock[0].quantity) + data.quantity
            if (newQty < 0) {
                return NextResponse.json({ error: 'Stock insuffisant pour cet ajustement' }, { status: 400 })
            }
            await sql`
        UPDATE stock SET quantity = ${newQty}, updated_at = NOW()
        WHERE id = ${existingStock[0].id}
      `
        } else if (data.quantity > 0) {
            await sql`
        INSERT INTO stock (depot_id, product_variant_id, lot_number, quantity)
        VALUES (${data.depotId}, ${data.productVariantId}, ${data.lotNumber || null}, ${data.quantity})
      `
        } else {
            return NextResponse.json({ error: 'Impossible de créer un stock négatif' }, { status: 400 })
        }

        // Record stock movement
        await sql`
      INSERT INTO stock_movements (
        company_id, depot_id, product_variant_id,
        movement_type, quantity, reference_type,
        lot_number, notes, created_by
      ) VALUES (
        ${session.user.companyId}, ${data.depotId}, ${data.productVariantId},
        ${data.reason}, ${data.quantity}, 'adjustment',
        ${data.lotNumber || null}, ${data.notes || null}, ${session.user.id}
      )
    `

        return NextResponse.json({
            success: true,
            message: 'Ajustement de stock enregistré',
        }, { status: 201 })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error creating adjustment:', error)
        return NextResponse.json({ error: 'Erreur lors de l\'ajustement' }, { status: 500 })
    }
}
