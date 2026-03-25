import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/credits — List credit notes with client info
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const clientId = searchParams.get('client_id')

    const credits = await sql`
      SELECT cn.*,
        c.name as client_name, c.phone as client_phone,
        so.order_number,
        u.full_name as created_by_name,
        CASE WHEN cn.due_date < CURRENT_DATE AND cn.status NOT IN ('paid', 'written_off') THEN true ELSE false END as is_overdue,
        CURRENT_DATE - cn.due_date as days_overdue
      FROM credit_notes cn
      LEFT JOIN clients c ON cn.client_id = c.id
      LEFT JOIN sales_orders so ON cn.sales_order_id = so.id
      LEFT JOIN users u ON cn.created_by = u.id
      WHERE cn.company_id = ${companyId}
        ${status ? sql`AND cn.status = ${status}` : sql``}
        ${clientId ? sql`AND cn.client_id = ${clientId}` : sql``}
      ORDER BY 
        CASE WHEN cn.status = 'overdue' THEN 0 WHEN cn.status = 'pending' THEN 1 WHEN cn.status = 'partial' THEN 2 ELSE 3 END,
        cn.due_date ASC NULLS LAST
    `

    // Summary stats
    const stats = await sql`
      SELECT
        COUNT(*) as total_credits,
        COALESCE(SUM(total_amount - paid_amount), 0) as total_outstanding,
        COUNT(CASE WHEN due_date < CURRENT_DATE AND status NOT IN ('paid', 'written_off') THEN 1 END) as overdue_count,
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND status NOT IN ('paid', 'written_off') THEN total_amount - paid_amount ELSE 0 END), 0) as overdue_amount
      FROM credit_notes
      WHERE company_id = ${companyId} AND status NOT IN ('paid', 'written_off')
    `

    return NextResponse.json({
      success: true,
      data: { credits, stats: stats[0] },
    })
  } catch (error) {
    console.error('Credits error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST /api/credits — Create a credit note
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const userId = session.user.id
    const body = await request.json()
    const { client_id, sales_order_id, total_amount, due_date, notes } = body

    if (!client_id || !total_amount || total_amount <= 0) {
      return NextResponse.json({ error: 'Client et montant requis' }, { status: 400 })
    }

    // Generate credit number
    const countResult = await sql`
      SELECT COUNT(*) as count FROM credit_notes WHERE company_id = ${companyId}
    `
    const creditNumber = `CR-${String(Number(countResult[0].count) + 1).padStart(5, '0')}`

    const result = await sql`
      INSERT INTO credit_notes (company_id, client_id, sales_order_id, credit_number, total_amount, due_date, notes, created_by)
      VALUES (${companyId}, ${client_id}, ${sales_order_id || null}, ${creditNumber}, ${total_amount}, ${due_date || null}, ${notes || null}, ${userId})
      RETURNING *
    `

    // Update client account balance
    await sql`
      INSERT INTO client_accounts (client_id, account_type, balance)
      VALUES (${client_id}, 'product', ${-total_amount})
      ON CONFLICT (client_id, account_type) DO UPDATE
      SET balance = client_accounts.balance - ${total_amount},
          last_transaction_at = NOW(),
          updated_at = NOW()
    `

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    console.error('Create credit error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
