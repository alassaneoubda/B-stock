import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/sales/[id] — Get sale order detail
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

        // Get order
        const orders = await sql`
      SELECT so.*, c.name as client_name, c.phone as client_phone,
             c.address as client_address, c.client_type,
             d.name as depot_name, u.full_name as created_by_name
      FROM sales_orders so
      LEFT JOIN clients c ON so.client_id = c.id
      LEFT JOIN depots d ON so.depot_id = d.id
      LEFT JOIN users u ON so.created_by = u.id
      WHERE so.id = ${id} AND so.company_id = ${session.user.companyId}
    `

        if (orders.length === 0) {
            return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
        }

        // Get order items
        const items = await sql`
      SELECT soi.*, p.name as product_name, p.brand,
             pt.name as packaging_name, pv.barcode
      FROM sales_order_items soi
      JOIN product_variants pv ON soi.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
      WHERE soi.sales_order_id = ${id}
    `

        // Get packaging items
        const packagingItems = await sql`
      SELECT sopi.*, pt.name as packaging_name
      FROM sales_order_packaging_items sopi
      JOIN packaging_types pt ON sopi.packaging_type_id = pt.id
      WHERE sopi.sales_order_id = ${id}
    `

        // Get payments
        const payments = await sql`
      SELECT p.*, u.full_name as received_by_name
      FROM payments p
      LEFT JOIN users u ON p.received_by = u.id
      WHERE p.sales_order_id = ${id}
      ORDER BY p.created_at
    `

        return NextResponse.json({
            success: true,
            data: {
                ...orders[0],
                items,
                packagingItems,
                payments,
            },
        })
    } catch (error) {
        console.error('Error fetching sale detail:', error)
        return NextResponse.json(
            { error: 'Erreur lors de la récupération de la commande' },
            { status: 500 }
        )
    }
}

// PATCH /api/sales/[id] — Update sale status
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
        const { status } = body

        const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']
        if (!validStatuses.includes(status)) {
            return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
        }

        const orders = await sql`
      UPDATE sales_orders
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${id} AND company_id = ${session.user.companyId}
      RETURNING *
    `

        if (orders.length === 0) {
            return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
        }

        return NextResponse.json({
            success: true,
            data: orders[0],
            message: 'Statut mis à jour',
        })
    } catch (error) {
        console.error('Error updating sale:', error)
        return NextResponse.json(
            { error: 'Erreur lors de la mise à jour' },
            { status: 500 }
        )
    }
}
