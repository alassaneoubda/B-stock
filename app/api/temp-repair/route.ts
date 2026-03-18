import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function GET() {
    try {
        const productsWithoutVariants = await sql`
            SELECT p.id, p.company_id, p.selling_price, p.purchase_price 
            FROM products p 
            LEFT JOIN product_variants pv ON p.id = pv.product_id 
            WHERE pv.id IS NULL
        `

        let repairedCount = 0
        for (const p of productsWithoutVariants) {
            // Find or create a default packaging type for this company
            const packagingTypes = await sql`
                SELECT id FROM packaging_types 
                WHERE company_id = ${p.company_id} 
                ORDER BY created_at ASC 
                LIMIT 1
            `

            if (packagingTypes.length > 0) {
                await sql`
                    INSERT INTO product_variants(product_id, packaging_type_id, price, cost_price) 
                    VALUES(${p.id}, ${packagingTypes[0].id}, ${p.selling_price}, ${p.purchase_price})
                `
                repairedCount++
            }
        }

        return NextResponse.json({ success: true, repaired: repairedCount, total: productsWithoutVariants.length })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Repair failed' }, { status: 500 })
    }
}
