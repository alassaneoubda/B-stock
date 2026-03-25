import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/cash/expenses — List expenses
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const category = searchParams.get('category')
    const companyId = session.user.companyId

    let expenses
    if (from && to) {
      expenses = await sql`
        SELECT e.*, u.full_name as created_by_name
        FROM expenses e
        LEFT JOIN users u ON e.created_by = u.id
        WHERE e.company_id = ${companyId}
          AND e.expense_date >= ${from}::date
          AND e.expense_date <= ${to}::date
          ${category ? sql`AND e.category = ${category}` : sql``}
        ORDER BY e.created_at DESC
      `
    } else {
      expenses = await sql`
        SELECT e.*, u.full_name as created_by_name
        FROM expenses e
        LEFT JOIN users u ON e.created_by = u.id
        WHERE e.company_id = ${companyId}
        ORDER BY e.created_at DESC
        LIMIT 50
      `
    }

    // Totals by category
    const totals = await sql`
      SELECT category, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM expenses
      WHERE company_id = ${companyId}
        AND expense_date >= COALESCE(${from}::date, CURRENT_DATE - INTERVAL '30 days')
        AND expense_date <= COALESCE(${to}::date, CURRENT_DATE)
      GROUP BY category
      ORDER BY total DESC
    `

    return NextResponse.json({ success: true, data: { expenses, totals } })
  } catch (error) {
    console.error('Expenses error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST /api/cash/expenses — Create an expense
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const userId = session.user.id
    const body = await request.json()
    const { category, amount, description, expense_date } = body

    if (!category || !amount || amount <= 0) {
      return NextResponse.json({ error: 'Catégorie et montant requis' }, { status: 400 })
    }

    // Find open cash session
    const openSessions = await sql`
      SELECT id FROM cash_sessions
      WHERE company_id = ${companyId} AND status = 'open'
      LIMIT 1
    `

    const cashSessionId = openSessions[0]?.id || null

    const result = await sql`
      INSERT INTO expenses (company_id, cash_session_id, category, amount, description, expense_date, created_by)
      VALUES (${companyId}, ${cashSessionId}, ${category}, ${amount}, ${description || null}, ${expense_date || new Date().toISOString().split('T')[0]}, ${userId})
      RETURNING *
    `

    // Record as cash movement if session open
    if (cashSessionId) {
      await sql`
        INSERT INTO cash_movements (company_id, cash_session_id, movement_type, category, amount, description, reference_type, reference_id, created_by)
        VALUES (${companyId}, ${cashSessionId}, 'cash_out', 'expense', ${amount}, ${description || 'Dépense: ' + category}, 'expense', ${result[0].id}, ${userId})
      `
    }

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    console.error('Create expense error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
