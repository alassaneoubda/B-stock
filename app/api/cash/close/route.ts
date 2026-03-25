import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// POST /api/cash/close — Close the current cash session
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const userId = session.user.id
    const body = await request.json()
    const { closing_amount, notes } = body

    // Find open session
    const openSessions = await sql`
      SELECT * FROM cash_sessions
      WHERE company_id = ${companyId} AND status = 'open'
      ORDER BY opened_at DESC LIMIT 1
    `
    if (openSessions.length === 0) {
      return NextResponse.json({ error: 'Aucune session de caisse ouverte' }, { status: 400 })
    }

    const cs = openSessions[0]

    // Calculate totals from movements
    const totals = await sql`
      SELECT
        COALESCE(SUM(CASE WHEN movement_type = 'cash_in' THEN amount ELSE 0 END), 0) as total_in,
        COALESCE(SUM(CASE WHEN movement_type = 'cash_out' THEN amount ELSE 0 END), 0) as total_out,
        COALESCE(SUM(CASE WHEN category = 'sale' THEN amount ELSE 0 END), 0) as total_sales,
        COALESCE(SUM(CASE WHEN category = 'expense' THEN amount ELSE 0 END), 0) as total_expenses
      FROM cash_movements
      WHERE cash_session_id = ${cs.id}
    `

    const totalIn = Number(totals[0].total_in)
    const totalOut = Number(totals[0].total_out)
    const totalSales = Number(totals[0].total_sales)
    const totalExpenses = Number(totals[0].total_expenses)
    const expectedAmount = Number(cs.opening_amount) + totalIn - totalOut
    const closingAmt = Number(closing_amount || 0)
    const variance = closingAmt - expectedAmount

    const result = await sql`
      UPDATE cash_sessions SET
        closed_by = ${userId},
        closing_amount = ${closingAmt},
        expected_amount = ${expectedAmount},
        variance = ${variance},
        total_sales = ${totalSales},
        total_expenses = ${totalExpenses},
        total_cash_in = ${totalIn},
        total_cash_out = ${totalOut},
        status = 'closed',
        notes = COALESCE(${notes || null}, notes),
        closed_at = NOW()
      WHERE id = ${cs.id}
      RETURNING *
    `

    await sql`
      INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
      VALUES (${companyId}, ${userId}, 'update', 'cash_session', ${cs.id},
        ${JSON.stringify({ closing_amount: closingAmt, expected: expectedAmount, variance })}::jsonb)
    `

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    console.error('Close cash session error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
