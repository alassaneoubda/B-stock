import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, sqlRaw, transaction, type SqlQuery } from '@/lib/db'

const returnSchema = z.object({
    items: z.array(z.object({
        productVariantId: z.string().uuid(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().min(0),
    })),
    packagingItems: z.array(z.object({
        packagingTypeId: z.string().uuid(),
        quantityIn: z.number().int().min(0), // Packaging returned to stock
        unitPrice: z.number().min(0),
    })).optional(),
    reason: z.string().optional(),
})

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authz = await requirePermission('returns.write')
        if (!authz.ok) return authz.response
        const { session, companyId } = authz

        const { id } = await params
        const body = await request.json()
        const data = returnSchema.parse(body)

        // 1. Get order details to find client and depot
        const orders = await sql`
            SELECT client_id, depot_id FROM sales_orders
            WHERE id = ${id} AND company_id = ${companyId}
        `
        if (orders.length === 0) {
            return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
        }
        const { client_id: clientId, depot_id: depotId } = orders[0]

        const writes: SqlQuery[] = []

        // 2. Process product returns
        let totalProductCredit = 0
        for (const item of data.items) {
            const amount = item.quantity * item.unitPrice
            totalProductCredit += amount

            writes.push(sqlRaw`
                UPDATE stock
                SET quantity = quantity + ${item.quantity}, updated_at = NOW()
                WHERE depot_id = ${depotId} AND product_variant_id = ${item.productVariantId}
            `)
            writes.push(sqlRaw`
                INSERT INTO stock_movements (
                    company_id, depot_id, product_variant_id,
                    movement_type, quantity, reference_type, reference_id,
                    notes, created_by
                ) VALUES (
                    ${companyId}, ${depotId}, ${item.productVariantId},
                    'return', ${item.quantity}, 'sales_order', ${id},
                    ${data.reason || 'Retour de vente'}, ${session.user.id}
                )
            `)
        }

        // 3. Process packaging returns
        let totalPackagingCredit = 0
        if (data.packagingItems && data.packagingItems.length > 0) {
            for (const pkg of data.packagingItems) {
                const amount = pkg.quantityIn * pkg.unitPrice
                totalPackagingCredit += amount

                writes.push(sqlRaw`
                    UPDATE packaging_stock
                    SET quantity = quantity + ${pkg.quantityIn}, updated_at = NOW()
                    WHERE depot_id = ${depotId} AND packaging_type_id = ${pkg.packagingTypeId}
                `)
                writes.push(sqlRaw`
                    INSERT INTO packaging_transactions (
                        company_id, client_id, sales_order_id,
                        packaging_type_id, transaction_type, quantity,
                        unit_price, total_amount, created_by
                    ) VALUES (
                        ${companyId}, ${clientId}, ${id},
                        ${pkg.packagingTypeId}, 'returned', ${pkg.quantityIn},
                        ${pkg.unitPrice}, ${amount}, ${session.user.id}
                    )
                `)
            }
        }

        // 4. Update client accounts (credit the balances)
        if (totalProductCredit > 0) {
            writes.push(sqlRaw`
                UPDATE client_accounts
                SET balance = balance + ${totalProductCredit}, last_transaction_at = NOW(), updated_at = NOW()
                WHERE client_id = ${clientId} AND account_type = 'product'
            `)
        }
        if (totalPackagingCredit > 0) {
            writes.push(sqlRaw`
                UPDATE client_accounts
                SET balance = balance + ${totalPackagingCredit}, last_transaction_at = NOW(), updated_at = NOW()
                WHERE client_id = ${clientId} AND account_type = 'packaging'
            `)
        }

        // Execute the whole return atomically
        await transaction(writes)

        return NextResponse.json({
            success: true,
            message: 'Retour enregistré avec succès',
            credits: { products: totalProductCredit, packaging: totalPackagingCredit }
        })

    } catch (error) {
        console.error('Error processing sales return:', error)
        return NextResponse.json({ error: 'Erreur lors du traitement du retour' }, { status: 500 })
    }
}
