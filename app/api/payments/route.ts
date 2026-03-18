import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/payments — List payments
export async function GET(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const clientId = searchParams.get('clientId')

        let payments
        if (clientId) {
            payments = await sql`
        SELECT p.*, c.name as client_name, so.order_number,
               u.full_name as received_by_name
        FROM payments p
        LEFT JOIN clients c ON p.client_id = c.id
        LEFT JOIN sales_orders so ON p.sales_order_id = so.id
        LEFT JOIN users u ON p.received_by = u.id
        WHERE p.company_id = ${session.user.companyId}
          AND p.client_id = ${clientId}
        ORDER BY p.created_at DESC
      `
        } else {
            payments = await sql`
        SELECT p.*, c.name as client_name, so.order_number,
               u.full_name as received_by_name
        FROM payments p
        LEFT JOIN clients c ON p.client_id = c.id
        LEFT JOIN sales_orders so ON p.sales_order_id = so.id
        LEFT JOIN users u ON p.received_by = u.id
        WHERE p.company_id = ${session.user.companyId}
        ORDER BY p.created_at DESC
        LIMIT 100
      `
        }

        return NextResponse.json({ success: true, data: payments })
    } catch (error) {
        console.error('Error fetching payments:', error)
        return NextResponse.json({ error: 'Erreur' }, { status: 500 })
    }
}

// POST /api/payments — Record a standalone payment
export async function POST(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const body = await request.json()
        const { clientId, salesOrderId, amount, paymentMethod, paymentType, reference, notes } = body

        if (!clientId || !amount || !paymentMethod) {
            return NextResponse.json({ error: 'Données manquantes' }, { status: 400 })
        }

        const payments = await sql`
      INSERT INTO payments (
        company_id, client_id, sales_order_id, amount,
        payment_method, payment_type, status, reference, notes, received_by
      ) VALUES (
        ${session.user.companyId}, ${clientId}, ${salesOrderId || null},
        ${amount}, ${paymentMethod}, ${paymentType || 'product'},
        'completed', ${reference || null}, ${notes || null}, ${session.user.id}
      )
      RETURNING *
    `

        // Update client account balance
        await sql`
      UPDATE client_accounts
      SET balance = balance + ${amount}, last_transaction_at = NOW(), updated_at = NOW()
      WHERE client_id = ${clientId} AND account_type = ${paymentType || 'product'}
    `

        // If linked to a sales order, update paid_amount
        if (salesOrderId) {
            await sql`
        UPDATE sales_orders
        SET paid_amount = paid_amount + ${amount}, updated_at = NOW()
        WHERE id = ${salesOrderId}
      `
        }

        return NextResponse.json({
            success: true,
            data: payments[0],
            message: 'Paiement enregistré',
        }, { status: 201 })
    } catch (error) {
        console.error('Error creating payment:', error)
        return NextResponse.json({ error: 'Erreur lors de l\'enregistrement du paiement' }, { status: 500 })
    }
}
