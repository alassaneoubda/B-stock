import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/agents — List sales agents with stats
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId

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
    `

    return NextResponse.json({ success: true, data: agents })
  } catch (error) {
    console.error('Agents error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST /api/agents — Create a sales agent
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const body = await request.json()
    const { full_name, phone, email, zone, commission_rate, user_id } = body

    if (!full_name) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO sales_agents (company_id, user_id, full_name, phone, email, zone, commission_rate)
      VALUES (${companyId}, ${user_id || null}, ${full_name}, ${phone || null}, ${email || null}, ${zone || null}, ${commission_rate || 0})
      RETURNING *
    `

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    console.error('Create agent error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
