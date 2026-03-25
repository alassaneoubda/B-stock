import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/agents/[id] — Agent detail with performance
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const agentId = params.id

    const agents = await sql`
      SELECT sa.*, u.full_name as user_name
      FROM sales_agents sa
      LEFT JOIN users u ON sa.user_id = u.id
      WHERE sa.id = ${agentId} AND sa.company_id = ${companyId}
    `
    if (agents.length === 0) {
      return NextResponse.json({ error: 'Commercial introuvable' }, { status: 404 })
    }

    // Assigned clients
    const clients = await sql`
      SELECT c.id, c.name, c.phone, c.zone, c.client_type,
        COALESCE((SELECT SUM(total_amount) FROM sales_orders WHERE client_id = c.id AND agent_id = ${agentId} AND status != 'cancelled'), 0) as total_sales
      FROM agent_client_assignments aca
      JOIN clients c ON aca.client_id = c.id
      WHERE aca.agent_id = ${agentId}
      ORDER BY total_sales DESC
    `

    // Monthly performance (last 6 months)
    const performance = await sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', so.created_at), 'Mon YYYY') as month,
        COALESCE(SUM(so.total_amount), 0) as total_sales,
        COUNT(so.id) as orders_count
      FROM sales_orders so
      WHERE so.agent_id = ${agentId} AND so.status != 'cancelled'
        AND so.created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', so.created_at)
      ORDER BY DATE_TRUNC('month', so.created_at) DESC
    `

    // Commissions
    const commissions = await sql`
      SELECT ac.*, so.order_number, c.name as client_name
      FROM agent_commissions ac
      LEFT JOIN sales_orders so ON ac.sales_order_id = so.id
      LEFT JOIN clients c ON so.client_id = c.id
      WHERE ac.agent_id = ${agentId}
      ORDER BY ac.created_at DESC
      LIMIT 20
    `

    return NextResponse.json({
      success: true,
      data: { agent: agents[0], clients, performance, commissions },
    })
  } catch (error) {
    console.error('Agent detail error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// PUT /api/agents/[id] — Update agent
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const agentId = params.id
    const body = await request.json()
    const { full_name, phone, email, zone, commission_rate, is_active } = body

    const result = await sql`
      UPDATE sales_agents SET
        full_name = COALESCE(${full_name || null}, full_name),
        phone = COALESCE(${phone || null}, phone),
        email = COALESCE(${email || null}, email),
        zone = COALESCE(${zone || null}, zone),
        commission_rate = COALESCE(${commission_rate}, commission_rate),
        is_active = COALESCE(${is_active}, is_active),
        updated_at = NOW()
      WHERE id = ${agentId} AND company_id = ${companyId}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json({ error: 'Commercial introuvable' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    console.error('Update agent error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
