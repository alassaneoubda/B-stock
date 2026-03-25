import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/geniuspay'
import { activateSubscription } from '@/lib/subscription'
import { sql } from '@/lib/db'

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  const signature = request.headers.get('x-webhook-signature')
  const timestamp = request.headers.get('x-webhook-timestamp')
  const eventType = request.headers.get('x-webhook-event')

  if (!signature || !timestamp || !eventType) {
    return NextResponse.json({ error: 'Missing webhook headers' }, { status: 400 })
  }

  // Verify signature if webhook secret is configured
  const webhookSecret = process.env.GENIUSPAY_WEBHOOK_SECRET
  if (webhookSecret) {
    const isValid = verifyWebhookSignature(rawBody, signature, timestamp, webhookSecret)
    if (!isValid) {
      console.error('[GeniusPay] Invalid webhook signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Replay attack protection — reject timestamps older than 5 minutes
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
      return NextResponse.json({ error: 'Timestamp too old' }, { status: 400 })
    }
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const data = payload.data
    const metadata = data?.metadata

    switch (eventType) {
      case 'payment.success': {
        if (!metadata?.companyId || !metadata?.planName || !metadata?.months) {
          console.error('[GeniusPay] Missing metadata in payment.success:', data?.reference)
          break
        }

        const months = parseInt(metadata.months, 10)
        if (isNaN(months) || months <= 0) {
          console.error('[GeniusPay] Invalid months:', metadata.months)
          break
        }

        const intervalLabels: Record<string, string> = {
          monthly: 'Mensuel',
          quarterly: 'Trimestriel',
          semiannual: 'Semestriel',
          yearly: 'Annuel',
        }
        const fullPlanName = metadata.interval
          ? `${metadata.planName} — ${intervalLabels[metadata.interval] || metadata.interval}`
          : metadata.planName

        await activateSubscription(
          metadata.companyId,
          fullPlanName,
          months,
          data?.reference || undefined
        )

        console.log(
          `[GeniusPay] Subscription activated: company=${metadata.companyId} plan=${metadata.planName} months=${months} ref=${data?.reference}`
        )
        break
      }

      case 'payment.failed': {
        if (metadata?.companyId) {
          await sql`
            UPDATE companies SET
              subscription_status = 'past_due',
              updated_at = NOW()
            WHERE id = ${metadata.companyId}
          `
          console.log(`[GeniusPay] Payment failed for company ${metadata.companyId}`)
        }
        break
      }

      case 'payment.cancelled':
      case 'payment.expired': {
        console.log(`[GeniusPay] Payment ${eventType}: ref=${data?.reference}`)
        break
      }

      default:
        // Unhandled event
        break
    }
  } catch (error) {
    console.error(`[GeniusPay] Error handling event ${eventType}:`, error)
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
