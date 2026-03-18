import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

const packagingUpdateSchema = z.object({
    name: z.string().min(1).optional(),
    unitsPerCase: z.number().int().min(1).optional(),
    isReturnable: z.boolean().optional(),
    depositPrice: z.number().min(0).optional(),
})

// GET /api/packaging/[id]
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

        const types = await sql`
            SELECT * FROM packaging_types
            WHERE id = ${id} AND company_id = ${session.user.companyId}
        `

        if (types.length === 0) {
            return NextResponse.json({ error: 'Emballage introuvable' }, { status: 404 })
        }

        return NextResponse.json({ success: true, data: types[0] })
    } catch (error) {
        console.error('Error fetching packaging type:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

// PATCH /api/packaging/[id]
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
        const data = packagingUpdateSchema.parse(body)

        const existing = await sql`
            SELECT id FROM packaging_types
            WHERE id = ${id} AND company_id = ${session.user.companyId}
        `
        if (existing.length === 0) {
            return NextResponse.json({ error: 'Emballage introuvable' }, { status: 404 })
        }

        const result = await sql`
            UPDATE packaging_types SET
                name = COALESCE(${data.name ?? null}, name),
                units_per_case = COALESCE(${data.unitsPerCase ?? null}, units_per_case),
                is_returnable = COALESCE(${data.isReturnable ?? null}, is_returnable),
                deposit_price = COALESCE(${data.depositPrice ?? null}, deposit_price)
            WHERE id = ${id}
            RETURNING *
        `

        return NextResponse.json({
            success: true,
            data: result[0],
            message: 'Emballage mis à jour',
        })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error updating packaging type:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

// DELETE /api/packaging/[id]
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

        // Check if packaging is used in variants
        const variants = await sql`
            SELECT COUNT(*) as count FROM product_variants WHERE packaging_type_id = ${id}
        `
        if (Number(variants[0].count) > 0) {
            return NextResponse.json({
                error: 'Impossible de supprimer : cet emballage est utilisé par des variantes produit',
            }, { status: 400 })
        }

        // Check if packaging has stock
        const stock = await sql`
            SELECT COALESCE(SUM(quantity), 0) as total FROM packaging_stock WHERE packaging_type_id = ${id}
        `
        if (Number(stock[0].total) > 0) {
            return NextResponse.json({
                error: 'Impossible de supprimer : du stock existe pour cet emballage',
            }, { status: 400 })
        }

        await sql`
            DELETE FROM packaging_equivalences
            WHERE (packaging_type_a = ${id} OR packaging_type_b = ${id})
              AND company_id = ${session.user.companyId}
        `

        const result = await sql`
            DELETE FROM packaging_types
            WHERE id = ${id} AND company_id = ${session.user.companyId}
            RETURNING id
        `

        if (result.length === 0) {
            return NextResponse.json({ error: 'Emballage introuvable' }, { status: 404 })
        }

        return NextResponse.json({ success: true, message: 'Emballage supprimé' })
    } catch (error) {
        console.error('Error deleting packaging type:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
