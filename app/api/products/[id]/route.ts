import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

const productUpdateSchema = z.object({
    name: z.string().min(1).optional(),
    sku: z.string().optional(),
    category: z.string().optional(),
    brand: z.string().optional(),
    description: z.string().optional(),
    baseUnit: z.string().optional(),
    purchasePrice: z.number().min(0).optional(),
    sellingPrice: z.number().min(0).optional(),
    imageUrl: z.string().optional(),
    isActive: z.boolean().optional(),
})

// GET /api/products/[id] — Get a single product with variants and stock
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

        const products = await sql`
      SELECT * FROM products
      WHERE id = ${id} AND company_id = ${session.user.companyId}
    `

        if (products.length === 0) {
            return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })
        }

        // Get variants with packaging info
        const variants = await sql`
      SELECT pv.*, pt.name as packaging_name, pt.units_per_case, pt.deposit_price
      FROM product_variants pv
      LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
      WHERE pv.product_id = ${id}
    `

        // Get stock per variant/depot
        const stock = await sql`
      SELECT s.*, d.name as depot_name
      FROM stock s
      JOIN depots d ON s.depot_id = d.id
      WHERE s.product_variant_id IN (
        SELECT id FROM product_variants WHERE product_id = ${id}
      )
      ORDER BY d.name
    `

        return NextResponse.json({
            success: true,
            data: {
                ...products[0],
                variants,
                stock,
            },
        })
    } catch (error) {
        console.error('Error fetching product:', error)
        return NextResponse.json(
            { error: 'Erreur lors de la récupération du produit' },
            { status: 500 }
        )
    }
}

// PUT /api/products/[id] — Update a product
export async function PUT(
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
        const data = productUpdateSchema.parse(body)

        // Verify product belongs to company
        const existing = await sql`
      SELECT id FROM products
      WHERE id = ${id} AND company_id = ${session.user.companyId}
    `
        if (existing.length === 0) {
            return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })
        }

        const products = await sql`
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
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `

        return NextResponse.json({
            success: true,
            data: products[0],
            message: 'Produit mis à jour avec succès',
        })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.errors },
                { status: 400 }
            )
        }
        console.error('Error updating product:', error)
        return NextResponse.json(
            { error: 'Erreur lors de la mise à jour du produit' },
            { status: 500 }
        )
    }
}

// DELETE /api/products/[id] — Soft delete a product
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

        // Verify product belongs to company
        const existing = await sql`
      SELECT id FROM products
      WHERE id = ${id} AND company_id = ${session.user.companyId}
    `
        if (existing.length === 0) {
            return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })
        }

        // Check if product has active stock or sales
        const hasStock = await sql`
      SELECT 1 FROM stock s
      JOIN product_variants pv ON s.product_variant_id = pv.id
      WHERE pv.product_id = ${id} AND s.quantity > 0
      LIMIT 1
    `

        if (hasStock.length > 0) {
            // Soft delete — deactivate
            await sql`
        UPDATE products SET is_active = false, updated_at = NOW()
        WHERE id = ${id}
      `
            return NextResponse.json({
                success: true,
                message: 'Produit désactivé (stock existant)',
            })
        }

        // Hard delete if no stock
        await sql`DELETE FROM product_variants WHERE product_id = ${id}`
        await sql`DELETE FROM products WHERE id = ${id}`

        return NextResponse.json({
            success: true,
            message: 'Produit supprimé avec succès',
        })
    } catch (error) {
        console.error('Error deleting product:', error)
        return NextResponse.json(
            { error: 'Erreur lors de la suppression du produit' },
            { status: 500 }
        )
    }
}
