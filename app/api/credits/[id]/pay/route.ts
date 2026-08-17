import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { sql, sqlRaw, transaction } from '@/lib/db'
import { createCashMovementFromCreditPayment, hasExistingCashMovement } from '@/lib/cash-automation'

// POST /api/credits/[id]/pay — Record a payment against a credit note
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('credits.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const creditId = (await params).id
    const body = await request.json()
    const { amount, payment_method, reference, notes } = body

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Montant invalide' }, { status: 400 })
    }

    // Get credit note
    const credits = await sql`
      SELECT * FROM credit_notes WHERE id = ${creditId} AND company_id = ${companyId}
    `
    if (credits.length === 0) {
      return NextResponse.json({ error: 'Créance introuvable' }, { status: 404 })
    }

    const credit = credits[0]
    const remaining = Number(credit.total_amount) - Number(credit.paid_amount)

    if (amount > remaining) {
      return NextResponse.json({ error: `Le montant dépasse le solde restant (${remaining} FCFA)` }, { status: 400 })
    }

    const newPaid = Number(credit.paid_amount) + amount
    const newStatus = newPaid >= Number(credit.total_amount) ? 'paid' : 'partial'

    // Record payment + update credit note + update client balance ATOMICALLY
    await transaction([
      sqlRaw`
        INSERT INTO credit_payments (credit_note_id, amount, payment_method, reference, notes, received_by)
        VALUES (${creditId}, ${amount}, ${payment_method || 'cash'}, ${reference || null}, ${notes || null}, ${userId})
      `,
      sqlRaw`
        UPDATE credit_notes SET
          paid_amount = ${newPaid},
          status = ${newStatus},
          updated_at = NOW()
        WHERE id = ${creditId}
      `,
      sqlRaw`
        UPDATE client_accounts SET
          balance = balance + ${amount},
          last_transaction_at = NOW(),
          updated_at = NOW()
        WHERE client_id = ${credit.client_id} AND account_type = ${credit.account_type || 'product'}
      `,
    ])

    const result = await sql`SELECT * FROM credit_notes WHERE id = ${creditId}`

    // Record cash movement if session open and payment is cash
    if (payment_method === 'cash') {
      try {
        // Vérifier si le mouvement existe déjà
        const existingMovement = await hasExistingCashMovement(companyId, 'credit_payment', creditId)
        if (!existingMovement) {
          await createCashMovementFromCreditPayment(
            companyId,
            creditId,
            amount,
            'cash',
            userId
          )
        }
      } catch (cashError) {
        console.error('Error creating cash movement (non-blocking):', cashError)
      }
    }

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    console.error('Credit payment error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
