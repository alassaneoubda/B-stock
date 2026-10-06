import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
import { createCashMovementFromExpense, findOpenCashSession } from '@/lib/cash-automation'
import { money } from '@/lib/domain/payments'

const EXPENSE_CATEGORIES = [
  'fuel',
  'maintenance',
  'salary',
  'rent',
  'utilities',
  'supplies',
  'transport',
  'other',
] as const

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ)')

// GET /api/cash/expenses — List expenses
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('cash.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')
    const from = fromParam ? isoDate.parse(fromParam) : null
    const to = toParam ? isoDate.parse(toParam) : null
    const category = searchParams.get('category')
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10) || 100, 1), 500)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

    const expenses = await sql`
      SELECT e.*, u.full_name as created_by_name
      FROM expenses e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.company_id = ${companyId}
        AND (${from}::date IS NULL OR e.expense_date >= ${from}::date)
        AND (${to}::date IS NULL OR e.expense_date <= ${to}::date)
        AND (${category}::text IS NULL OR e.category = ${category}::text)
      ORDER BY e.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

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
    return handleRouteError(error, 'cash.expenses.list')
  }
}

const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.coerce.number().positive('Le montant doit être positif'),
  description: z.string().max(1000).optional().nullable(),
  expense_date: isoDate.optional().nullable().or(z.literal('')),
})

// POST /api/cash/expenses — Create an expense (paid from the open cash session)
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('cash.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const data = expenseSchema.parse(await request.json())
    const amount = money(data.amount)

    const expense = await withTransaction(async (tx) => {
      const session = await findOpenCashSession(tx.sql, companyId)
      if (!session) throw new AppError(409, 'Aucune caisse ouverte', 'NO_OPEN_CASH')

      const [row] = await tx.sql`
        INSERT INTO expenses (company_id, cash_session_id, category, amount, description, expense_date, created_by)
        VALUES (
          ${companyId}, ${session.id}, ${data.category}, ${amount}, ${data.description || null},
          COALESCE(${data.expense_date || null}::date, CURRENT_DATE), ${userId}
        )
        RETURNING *
      `

      const movement = await createCashMovementFromExpense(
        companyId,
        row.id,
        amount,
        data.category,
        data.description || null,
        userId,
        tx.sql
      )
      if (!movement) throw new AppError(409, 'Aucune caisse ouverte', 'NO_OPEN_CASH')
      return row
    })

    return NextResponse.json({ success: true, data: expense })
  } catch (error) {
    return handleRouteError(error, 'cash.expenses.create')
  }
}
