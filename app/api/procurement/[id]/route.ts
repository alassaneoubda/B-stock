import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const orders = await sql`
            SELECT 
                po.*, 
                s.name as supplier_name,
                d.name as depot_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN depots d ON po.depot_id = d.id
            WHERE po.id = ${id} AND po.company_id = ${session.user.companyId}
        `

        if (orders.length === 0) {
            return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
        }

        const items = await sql`
            SELECT 
                poi.*, 
                p.name as product_name, 
                pt.name as packaging_name
            FROM purchase_order_items poi
            JOIN product_variants pv ON poi.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            JOIN packaging_types pt ON pv.packaging_type_id = pt.id
            WHERE poi.purchase_order_id = ${id}
        `

        return NextResponse.json({
            success: true,
            data: { ...orders[0], items }
        })
    } catch (error) {
        console.error('Error fetching order detail:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
