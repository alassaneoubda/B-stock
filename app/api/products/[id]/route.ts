import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { DuplicateSkuError } from '@/lib/products'

const productUpdateSchema = z.object({
    name: z.string().trim().min(1).max(255).optional(),
    sku: z.string().trim().max(100).optional(),
    category: z.string().max(100).optional(),
    brand: z.string().max(100).optional(),
    description: z.string().max(5000).optional(),
    baseUnit: z.string().min(1).max(50).optional(),
    purchasePrice: z.number().min(0).optional(),
    sellingPrice: z.number().min(0).optional(),
    imageUrl: z.string().max(2000).optional(),
    isActive: z.boolean().optional(),
    /** TVA propre au produit (%) ; null = revenir au taux standard de l'entreprise. */
    vatRate: z.number().min(0).max(100).nullable().optional(),
})

type Params = { params: Promise<{ id: string }> }

// GET /api/products/[id] — Get a single product with variants and stock
export async function GET(_request: NextRequest, { params }: Params) {
    try {
        const authz = await requirePermission('products.read')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { id } = await params
        if (!isUuid(id)) throw notFound('Produit')

        const products = await sql`
            SELECT * FROM products
            WHERE id = ${id} AND company_id = ${companyId}
        `
        if (products.length === 0) throw notFound('Produit')

        const variants = await sql`
            SELECT pv.*, pt.name AS packaging_name, pt.units_per_case, pt.deposit_price
            FROM product_variants pv
            LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
            WHERE pv.product_id = ${id}
        `

        const stock = await sql`
            SELECT s.*, d.name AS depot_name
            FROM stock s
            JOIN depots d ON s.depot_id = d.id
            JOIN product_variants pv ON pv.id = s.product_variant_id
            WHERE pv.product_id = ${id} AND d.company_id = ${companyId}
            ORDER BY d.name
        `

        return NextResponse.json({
            success: true,
            data: { ...products[0], variants, stock },
        })
    } catch (error) {
        return handleRouteError(error, 'products.get')
    }
}

// PUT /api/products/[id] — Update a product
export async function PUT(request: NextRequest, { params }: Params) {
    try {
        const authz = await requirePermission('products.write')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { id } = await params
        if (!isUuid(id)) throw notFound('Produit')
        const data = productUpdateSchema.parse(await request.json())

        const product = await withTransaction(async (tx) => {
            const [current] = await tx.sql`
                SELECT id, sku, is_active FROM products
                WHERE id = ${id} AND company_id = ${companyId}
                FOR UPDATE
            `
            if (!current) throw notFound('Produit')

            // Unicité du SKU parmi les produits actifs (même verrou que la création)
            const nextSku = (data.sku ?? current.sku ?? '') as string
            const nextActive = data.isActive ?? current.is_active !== false
            if (nextSku && nextActive) {
                await tx.sql`SELECT pg_advisory_xact_lock(hashtext(${`${companyId}:product-sku:${nextSku}`}))`
                const dup = await tx.sql`
                    SELECT 1 FROM products
                    WHERE company_id = ${companyId} AND sku = ${nextSku}
                      AND is_active = true AND id <> ${id}
                    LIMIT 1
                `
                if (dup.length > 0) throw new DuplicateSkuError(nextSku)
            }

            const [row] = await tx.sql`
                UPDATE products SET
                    name = COALESCE(${data.name ?? null}, name),
                    sku = COALESCE(${data.sku ?? null}, sku),
                    category = COALESCE(${data.category ?? null}, category),
                    brand = COALESCE(${data.brand ?? null}, brand),
                    description = COALESCE(${data.description ?? null}, description),
                    base_unit = COALESCE(${data.baseUnit ?? null}, base_unit),
                    purchase_price = COALESCE(${data.purchasePrice ?? null}, purchase_price),
                    selling_price = COALESCE(${data.sellingPrice ?? null}, selling_price),
                    image_url = COALESCE(${data.imageUrl ?? null}, image_url),
                    is_active = COALESCE(${data.isActive ?? null}, is_active),
                    vat_rate = CASE WHEN ${data.vatRate !== undefined}::boolean THEN ${data.vatRate ?? null}::numeric ELSE vat_rate END,
                    updated_at = NOW()
                WHERE id = ${id} AND company_id = ${companyId}
                RETURNING *
            `
            return row
        })

        return NextResponse.json({
            success: true,
            data: product,
            message: 'Produit mis à jour avec succès',
        })
    } catch (error) {
        return handleRouteError(error, 'products.update')
    }
}

// DELETE /api/products/[id]
// Suppression définitive seulement si le produit n'est référencé nulle part
// (stock, mouvements, ventes, achats, inventaires…). Sinon : désactivation
// (is_active = false) pour conserver l'historique.
export async function DELETE(_request: NextRequest, { params }: Params) {
    try {
        const authz = await requirePermission('products.delete')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { id } = await params
        if (!isUuid(id)) throw notFound('Produit')

        const result = await withTransaction(async (tx) => {
            const [current] = await tx.sql`
                SELECT id FROM products
                WHERE id = ${id} AND company_id = ${companyId}
                FOR UPDATE
            `
            if (!current) throw notFound('Produit')

            // Les variantes partent en cascade ; toute référence (FK) vers elles
            // fait échouer la suppression -> on revient au point de sauvegarde.
            await tx.sql`SAVEPOINT product_delete`
            try {
                await tx.sql`DELETE FROM products WHERE id = ${id} AND company_id = ${companyId}`
                await tx.sql`RELEASE SAVEPOINT product_delete`
                return { softDeleted: false }
            } catch (error) {
                if ((error as { code?: string })?.code !== '23503') throw error
                await tx.sql`ROLLBACK TO SAVEPOINT product_delete`
                await tx.sql`
                    UPDATE products SET is_active = false, updated_at = NOW()
                    WHERE id = ${id} AND company_id = ${companyId}
                `
                return { softDeleted: true }
            }
        })

        return NextResponse.json({
            success: true,
            softDeleted: result.softDeleted,
            message: result.softDeleted
                ? 'Produit désactivé : il est lié à du stock, des mouvements ou des documents (historique conservé)'
                : 'Produit supprimé avec succès',
        })
    } catch (error) {
        return handleRouteError(error, 'products.delete')
    }
}
