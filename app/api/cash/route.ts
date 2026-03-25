import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/cash — Get current open session + recent sessions
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId

    // Get current open session
    const openSessions = await sql`
      SELECT cs.*, u.full_name as opened_by_name, d.name as depot_name
      FROM cash_sessions cs
      LEFT JOIN users u ON cs.opened_by = u.id
      LEFT JOIN depots d ON cs.depot_id = d.id
      WHERE cs.company_id = ${companyId} AND cs.status = 'open'
      ORDER BY cs.opened_at DESC
      LIMIT 1
    `

    // Get recent closed sessions
    const recentSessions = await sql`
      SELECT cs.*, 
        ou.full_name as opened_by_name,
        cu.full_name as closed_by_name,
        d.name as depot_name
      FROM cash_sessions cs
      LEFT JOIN users ou ON cs.opened_by = ou.id
      LEFT JOIN users cu ON cs.closed_by = cu.id
      LEFT JOIN depots d ON cs.depot_id = d.id
      WHERE cs.company_id = ${companyId}
      ORDER BY cs.opened_at DESC
      LIMIT 20
    `

    return NextResponse.json({
      success: true,
      data: {
        currentSession: openSessions[0] || null,
        sessions: recentSessions,
      },
    })
  } catch (error) {
    console.error('Cash sessions error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST /api/cash — Open a new cash session
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const userId = session.user.id
    const body = await request.json()
    const { opening_amount, depot_id, notes } = body

    // Check no open session exists
    const existing = await sql`
      SELECT id FROM cash_sessions 
      WHERE company_id = ${companyId} AND status = 'open'
      LIMIT 1
    `
    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Une session de caisse est déjà ouverte. Clôturez-la d\'abord.' },
        { status: 400 }
      )
    }

    const result = await sql`
      INSERT INTO cash_sessions (company_id, depot_id, opened_by, opening_amount, notes)
      VALUES (${companyId}, ${depot_id || null}, ${userId}, ${opening_amount || 0}, ${notes || null})
      RETURNING *
    `

    // Log audit
    await sql`
      INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
      VALUES (${companyId}, ${userId}, 'create', 'cash_session', ${result[0].id}, 
        ${JSON.stringify({ opening_amount: opening_amount || 0 })}::jsonb)
    `

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    console.error('Open cash session error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
