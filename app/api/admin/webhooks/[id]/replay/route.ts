import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, logAdminAction } from '@/lib/admin-auth'
import { activateSubscription, isReferenceApplied, recordSubscriptionPayment } from '@/lib/subscription'
import { sql } from '@/lib/db'

const intervalLabels: Record<string, string> = {
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  semiannual: 'Semestriel',
  yearly: 'Annuel',
}

// POST /api/admin/webhooks/:id/replay — re-process a stored webhook event
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
    if (event.event_type !== 'payment.success') {
      return NextResponse.json(
        { error: 'Seuls les événements payment.success peuvent être rejoués' },
        { status: 400 }
      )
    }

    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload
    const data = payload?.data
    const metadata = data?.metadata

    if (!metadata?.companyId || !metadata?.planName || !metadata?.months) {
      return NextResponse.json({ error: 'Métadonnées insuffisantes pour rejouer' }, { status: 400 })
    }

    const months = parseInt(metadata.months, 10)
    const reference = data?.reference || null

    if (reference && (await isReferenceApplied(reference))) {
      await sql`UPDATE webhook_events SET status = 'replayed', processed_at = NOW() WHERE id = ${id}`
      return NextResponse.json({ success: true, alreadyApplied: true })
    }

    const fullPlanName = metadata.interval
      ? `${metadata.planName} — ${intervalLabels[metadata.interval] || metadata.interval}`
      : metadata.planName

    await activateSubscription(metadata.companyId, fullPlanName, months, reference || undefined)
    await recordSubscriptionPayment({
      companyId: metadata.companyId,
      reference,
      planName: fullPlanName,
      amount: Number(data?.amount) || 0,
      currency: data?.currency || 'XOF',
      months,
      status: 'completed',
      provider: 'geniuspay',
    })

    await sql`UPDATE webhook_events SET status = 'replayed', processed_at = NOW() WHERE id = ${id}`
    await logAdminAction(authz.adminId, authz.adminEmail, 'webhook.replay', 'webhook', id, { reference })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('admin webhook replay error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
