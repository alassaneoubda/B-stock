import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// POST /api/credits/[id]/remind — Log a reminder for a credit note
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const userId = session.user.id
    const creditId = params.id
    const body = await request.json()
    const { reminder_type, message } = body

    // Verify credit exists
    const credits = await sql`
      SELECT cn.*, c.name as client_name, c.phone as client_phone
      FROM credit_notes cn
      JOIN clients c ON cn.client_id = c.id
      WHERE cn.id = ${creditId} AND cn.company_id = ${companyId}
    `
    if (credits.length === 0) {
      return NextResponse.json({ error: 'Créance introuvable' }, { status: 404 })
    }

    const result = await sql`
      INSERT INTO credit_reminders (credit_note_id, reminder_type, message, sent_by)
      VALUES (${creditId}, ${reminder_type || 'call'}, ${message || null}, ${userId})
      RETURNING *
    `

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    console.error('Credit reminder error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
