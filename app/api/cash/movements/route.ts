import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/cash/movements — List movements for current or specified session
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('session_id')
    const requiresValidation = searchParams.get('requires_validation')

    let movements
    if (sessionId) {
      movements = await sql`
        SELECT cm.*, u.full_name as created_by_name, v.full_name as validated_by_name
        FROM cash_movements cm
        LEFT JOIN users u ON cm.created_by = u.id
        LEFT JOIN users v ON cm.validated_by = v.id
        WHERE cm.cash_session_id = ${sessionId} AND cm.company_id = ${companyId}
        ORDER BY cm.created_at DESC
      `
    } else if (requiresValidation === 'true') {
      // Get movements requiring validation
      movements = await sql`
        SELECT cm.*, u.full_name as created_by_name, v.full_name as validated_by_name
        FROM cash_movements cm
        LEFT JOIN users u ON cm.created_by = u.id
        LEFT JOIN users v ON cm.validated_by = v.id
        WHERE cm.company_id = ${companyId} 
          AND cm.requires_validation = true 
          AND cm.validation_status IS NULL
        ORDER BY cm.created_at DESC
      `
    } else {
      // Get movements for current open session
      movements = await sql`
        SELECT cm.*, u.full_name as created_by_name, v.full_name as validated_by_name
        FROM cash_movements cm
        LEFT JOIN users u ON cm.created_by = u.id
        LEFT JOIN users v ON cm.validated_by = v.id
        JOIN cash_sessions cs ON cm.cash_session_id = cs.id
        WHERE cm.company_id = ${companyId} AND cs.status = 'open'
        ORDER BY cm.created_at DESC
      `
    }

    return NextResponse.json({ success: true, data: movements })
  } catch (error) {
    console.error('Cash movements error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST /api/cash/movements — Add a cash movement (entry or exit)
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const userId = session.user.id
    const body = await request.json()
    const { movement_type, category, amount, description, reference_type, reference_id } = body

    if (!movement_type || !category || !amount || amount <= 0) {
      return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
    }

    // Find open session
    const openSessions = await sql`
      SELECT id FROM cash_sessions
      WHERE company_id = ${companyId} AND status = 'open'
      LIMIT 1
    `
    if (openSessions.length === 0) {
      return NextResponse.json({ error: 'Aucune session de caisse ouverte' }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO cash_movements (company_id, cash_session_id, movement_type, category, amount, description, reference_type, reference_id, created_by, requires_validation)
      VALUES (${companyId}, ${openSessions[0].id}, ${movement_type}, ${category}, ${amount}, ${description || null}, ${reference_type || null}, ${reference_id || null}, ${userId}, ${!reference_type || reference_type === 'manual'})
      RETURNING *
    `

    // If it's an expense, also log it in expenses table
    if (category === 'expense' && movement_type === 'cash_out') {
      await sql`
        INSERT INTO expenses (company_id, cash_session_id, category, amount, description, created_by)
        VALUES (${companyId}, ${openSessions[0].id}, 'other', ${amount}, ${description || null}, ${userId})
      `
    }

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    console.error('Add cash movement error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
