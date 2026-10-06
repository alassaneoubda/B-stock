import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { handleEvent } from '@/lib/subscription-webhook'

// POST /api/admin/webhooks/:id/replay — re-process a stored webhook event
// Même traitement que le webhook (idempotent : un paiement déjà appliqué n'est
// jamais appliqué deux fois).
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const [event] = await sql`SELECT * FROM webhook_events WHERE id = ${id}`
    if (!event) {
      return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 })
    }
    if (event.signature_valid !== true) {
      return NextResponse.json(
        { error: 'Un événement à signature invalide ne peut pas être rejoué' },
        { status: 400 }
      )
    }
    if (event.event_type !== 'payment.success') {
      return NextResponse.json(
        { error: 'Seuls les événements payment.success peuvent être rejoués' },
        { status: 400 }
      )
    }

    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload
    const outcome = await handleEvent(event.event_type, payload?.data)

    await sql`UPDATE webhook_events SET status = 'replayed', processed_at = NOW() WHERE id = ${id}`
    await logAdminAction(authz.adminId, authz.adminEmail, 'webhook.replay', 'webhook', id, {
      reference: payload?.data?.reference ?? null,
      outcome,
    })

    return NextResponse.json({ success: true, alreadyApplied: outcome === 'ignored' })
  } catch (e) {
    console.error('admin webhook replay error:', e)
    return NextResponse.json({ error: 'Erreur lors du rejeu' }, { status: 500 })
  }
}
