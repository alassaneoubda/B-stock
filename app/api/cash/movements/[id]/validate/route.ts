import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// POST /api/cash/movements/[id]/validate — Validate or reject a cash movement
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const userId = session.user.id
    const movementId = params.id
    const body = await request.json()
    const { approved, notes } = body

    // Get movement
    const movements = await sql`
      SELECT * FROM cash_movements 
      WHERE id = ${movementId} AND company_id = ${companyId}
    `
    if (movements.length === 0) {
      return NextResponse.json({ error: 'Mouvement introuvable' }, { status: 404 })
    }

    const movement = movements[0]

    // Update movement with validation
    await sql`
      UPDATE cash_movements SET
        validated_by = ${userId},
        validated_at = NOW(),
        validation_notes = ${notes || null},
        validation_status = ${approved ? 'approved' : 'rejected'}
      WHERE id = ${movementId}
    `

    // If rejected and it was cash_in, we need to reverse the cash amount
    if (!approved && movement.movement_type === 'cash_in') {
      // Create a reversing movement
      await sql`
        INSERT INTO cash_movements (
          company_id, cash_session_id, movement_type, category, amount,
          description, reference_type, reference_id, created_by,
          validation_status, validated_by, validated_at
        )
        VALUES (
          ${companyId}, ${movement.cash_session_id}, 'cash_out', 'reversal', ${movement.amount},
          'Annulation du mouvement #' || ${movementId}, 'reversal', ${movementId}, ${userId},
          'approved', ${userId}, NOW()
        )
      `
    }

    // Log audit
    await sql`
      INSERT INTO audit_logs (company_id, action, entity_type, entity_id, details, user_id)
      VALUES (
        ${companyId}, 
        ${approved ? 'validate' : 'reject'}, 
        'cash_movement', 
        ${movementId}, 
        ${JSON.stringify({ movement_type: movement.movement_type, amount: movement.amount, notes: notes || null })},
        ${userId}
      )
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Cash movement validation error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
