import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { z } from 'zod'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v)

const agentSchema = z.object({
  full_name: z.string().trim().min(1, 'Nom requis').max(200),
  phone: z.preprocess(emptyToUndefined, z.string().max(50).optional()),
  email: z.preprocess(emptyToUndefined, z.string().email('Email invalide').max(200).optional()),
  zone: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  commission_rate: z.coerce.number().min(0, 'Taux entre 0 et 100').max(100, 'Taux entre 0 et 100').optional().default(0),
  user_id: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
})

// GET /api/agents — List sales agents with stats
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('agents.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10) || 100, 1), 500)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

    const agents = await sql`
      SELECT sa.*,
        u.full_name as user_name,
        (SELECT COUNT(*) FROM agent_client_assignments WHERE agent_id = sa.id) as client_count,
        COALESCE((
          SELECT SUM(so.total_amount) FROM sales_orders so
          WHERE so.agent_id = sa.id AND so.status != 'cancelled'
          AND so.created_at >= DATE_TRUNC('month', CURRENT_DATE)
        ), 0) as monthly_sales,
        COALESCE((
          SELECT SUM(ac.commission_amount) FROM agent_commissions ac
          WHERE ac.agent_id = sa.id AND ac.status = 'pending'
        ), 0) as pending_commissions
      FROM sales_agents sa
      LEFT JOIN users u ON sa.user_id = u.id
      WHERE sa.company_id = ${companyId}
      ORDER BY sa.is_active DESC, sa.full_name ASC
      LIMIT ${limit} OFFSET ${offset}
    `

    return NextResponse.json({ success: true, data: agents })
  } catch (error) {
    return handleRouteError(error, 'agents.list')
  }
}

// POST /api/agents — Create a sales agent
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('agents.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const d = agentSchema.parse(await request.json())
    await assertOwned(sql, companyId, { users: [d.user_id] })

    const result = await sql`
      INSERT INTO sales_agents (company_id, user_id, full_name, phone, email, zone, commission_rate)
      VALUES (${companyId}, ${d.user_id ?? null}, ${d.full_name}, ${d.phone ?? null}, ${d.email ?? null}, ${d.zone ?? null}, ${d.commission_rate})
      RETURNING *
    `

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    return handleRouteError(error, 'agents.create')
  }
}
