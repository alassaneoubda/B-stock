import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'

const packagingUpdateSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    unitsPerCase: z.number().int().min(1).optional(),
    isReturnable: z.boolean().optional(),
    depositPrice: z.number().min(0).optional(),
})

type Params = { params: Promise<{ id: string }> }

// GET /api/packaging/[id]
export async function GET(_request: NextRequest, { params }: Params) {
    try {
        const authz = await requirePermission('packaging.read')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { id } = await params
        if (!isUuid(id)) throw notFound('Emballage')

        const [type] = await sql`
            SELECT * FROM packaging_types
            WHERE id = ${id} AND company_id = ${companyId}
        `
        if (!type) throw notFound('Emballage')

        return NextResponse.json({ success: true, data: type })
    } catch (error) {
        return handleRouteError(error, 'packaging.get')
    }
}

// PATCH /api/packaging/[id]
export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const authz = await requirePermission('packaging.write')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { id } = await params
        if (!isUuid(id)) throw notFound('Emballage')
        const data = packagingUpdateSchema.parse(await request.json())

        const [updated] = await sql`
            UPDATE packaging_types SET
                name = COALESCE(${data.name ?? null}, name),
                units_per_case = COALESCE(${data.unitsPerCase ?? null}, units_per_case),
                is_returnable = COALESCE(${data.isReturnable ?? null}, is_returnable),
                deposit_price = COALESCE(${data.depositPrice ?? null}, deposit_price)
            WHERE id = ${id} AND company_id = ${companyId}
            RETURNING *
        `
        if (!updated) throw notFound('Emballage')

        return NextResponse.json({ success: true, data: updated, message: 'Emballage mis à jour' })
    } catch (error) {
        return handleRouteError(error, 'packaging.update')
    }
}

// DELETE /api/packaging/[id]
export async function DELETE(_request: NextRequest, { params }: Params) {
    try {
        const authz = await requirePermission('packaging.write')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { id } = await params
        if (!isUuid(id)) throw notFound('Emballage')

        await withTransaction(async (tx) => {
            // Appartenance vérifiée AVANT tout comptage (pas d'oracle inter-entreprises)
            const [current] = await tx.sql`
                SELECT id FROM packaging_types
                WHERE id = ${id} AND company_id = ${companyId}
                FOR UPDATE
            `
            if (!current) throw notFound('Emballage')

            const [variants] = await tx.sql`
                SELECT COUNT(*)::int AS count FROM product_variants WHERE packaging_type_id = ${id}
            `
            if (Number(variants.count) > 0) {
                throw new AppError(
                    400,
                    'Impossible de supprimer : cet emballage est utilisé par des variantes produit',
                    'IN_USE'
                )
            }

            const [stock] = await tx.sql`
                SELECT COALESCE(SUM(ps.quantity), 0)::int AS total
                FROM packaging_stock ps
                JOIN depots d ON d.id = ps.depot_id
                WHERE ps.packaging_type_id = ${id} AND d.company_id = ${companyId}
            `
            if (Number(stock.total) > 0) {
                throw new AppError(400, 'Impossible de supprimer : du stock existe pour cet emballage', 'IN_USE')
            }

            await tx.sql`
                DELETE FROM packaging_equivalences
                WHERE (packaging_type_a = ${id} OR packaging_type_b = ${id})
                  AND company_id = ${companyId}
            `
            // Lignes de stock à 0 (créées automatiquement) : elles bloqueraient la suppression (FK)
            await tx.sql`
                DELETE FROM packaging_stock ps
                USING depots d
                WHERE d.id = ps.depot_id AND d.company_id = ${companyId}
                  AND ps.packaging_type_id = ${id} AND ps.quantity = 0
            `
            try {
                await tx.sql`DELETE FROM packaging_types WHERE id = ${id} AND company_id = ${companyId}`
            } catch (error) {
                if ((error as { code?: string })?.code === '23503') {
                    throw new AppError(
                        409,
                        'Impossible de supprimer : cet emballage est référencé par des ventes, mouvements ou inventaires',
                        'IN_USE'
                    )
                }
                throw error
            }
        })

        return NextResponse.json({ success: true, message: 'Emballage supprimé' })
    } catch (error) {
        return handleRouteError(error, 'packaging.delete')
    }
}
