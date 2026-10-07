import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
import { assertOwned, isUuid } from '@/lib/tenant'
import { nextDocumentNumber } from '@/lib/sequences'
import { money } from '@/lib/domain/payments'
import { assertPeriodOpen } from '@/lib/accounting/period-lock'

const CREDIT_STATUSES = ['pending', 'partial', 'paid', 'overdue', 'written_off'] as const

// GET /api/credits — List credit notes with client info
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('credits.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status')
    const status = statusParam && (CREDIT_STATUSES as readonly string[]).includes(statusParam) ? statusParam : null
    const clientIdParam = searchParams.get('client_id')
    const clientId = isUuid(clientIdParam) ? clientIdParam : null
    if ((statusParam && !status) || (clientIdParam && !clientId)) {
      return NextResponse.json({ error: 'Filtre invalide' }, { status: 400 })
    }
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10) || 100, 1), 500)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

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
        AND (${status}::text IS NULL OR cn.status = ${status}::text)
        AND (${clientId}::uuid IS NULL OR cn.client_id = ${clientId}::uuid)
      ORDER BY
        CASE WHEN cn.status = 'overdue' THEN 0 WHEN cn.status = 'pending' THEN 1 WHEN cn.status = 'partial' THEN 2 ELSE 3 END,
        cn.due_date ASC NULLS LAST,
        cn.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
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
    return handleRouteError(error, 'credits.list')
  }
}

const creditSchema = z.object({
  client_id: z.string().uuid(),
  sales_order_id: z.string().uuid().optional().nullable(),
  total_amount: z.coerce.number().positive('Montant invalide'),
  account_type: z.enum(['product', 'packaging']).optional().default('product'),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ)')
    .optional()
    .nullable()
    .or(z.literal('')),
  notes: z.string().max(2000).optional().nullable(),
})

// POST /api/credits — Create a credit note (manual debt)
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('credits.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const data = creditSchema.parse(await request.json())
    const amount = money(data.total_amount)
    const salesOrderId = data.sales_order_id || null

    const credit = await withTransaction(async (tx) => {
      // Mois clôturé (export comptable transmis) : opération refusée
      await assertPeriodOpen(tx.sql, companyId)
      await assertOwned(tx.sql, companyId, { clients: [data.client_id], salesOrders: [salesOrderId] })
      if (salesOrderId) {
        const [order] = await tx.sql`SELECT client_id FROM sales_orders WHERE id = ${salesOrderId}`
        if (order.client_id !== data.client_id) {
          throw new AppError(400, "Cette commande n'appartient pas à ce client", 'ORDER_CLIENT_MISMATCH')
        }
      }

      const creditNumber = await nextDocumentNumber(tx, companyId, 'credit')
      const [row] = await tx.sql`
        INSERT INTO credit_notes (
          company_id, client_id, sales_order_id, credit_number, account_type,
          total_amount, due_date, notes, created_by
        )
        VALUES (
          ${companyId}, ${data.client_id}, ${salesOrderId}, ${creditNumber}, ${data.account_type},
          ${amount}, ${data.due_date || null}, ${data.notes || null}, ${userId}
        )
        RETURNING *
      `

      // La créance augmente la dette du client (solde négatif = le client doit)
      await tx.sql`
        INSERT INTO client_accounts (client_id, account_type, balance, last_transaction_at)
        VALUES (${data.client_id}, ${data.account_type}, ${-amount}, NOW())
        ON CONFLICT (client_id, account_type) DO UPDATE
        SET balance = client_accounts.balance + EXCLUDED.balance,
            last_transaction_at = NOW(),
            updated_at = NOW()
      `
      return row
    })

    return NextResponse.json({ success: true, data: credit })
  } catch (error) {
    return handleRouteError(error, 'credits.create')
  }
}
