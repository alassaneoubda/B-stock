import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'

// POST /api/admin/billing/:id/refund — mark a payment as refunded (manual)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const [payment] = await sql`SELECT id, status FROM subscription_payments WHERE id = ${id}`
    if (!payment) {
      return NextResponse.json({ error: 'Paiement introuvable' }, { status: 404 })
    }
    if (payment.status !== 'completed') {
      return NextResponse.json(
        { error: 'Seul un paiement complété peut être remboursé' },
        { status: 400 }
      )
    }

    await sql`UPDATE subscription_payments SET status = 'refunded' WHERE id = ${id}`
    await logAdminAction(authz.adminId, authz.adminEmail, 'payment.refund', 'payment', id)

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('admin refund error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
