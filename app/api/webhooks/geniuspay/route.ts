import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/geniuspay'
import { activateSubscription, isReferenceApplied, recordSubscriptionPayment } from '@/lib/subscription'
import { recordWebhookEvent } from '@/lib/webhooks'
import { sql } from '@/lib/db'

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  const signature = request.headers.get('x-webhook-signature')
  const timestamp = request.headers.get('x-webhook-timestamp')
  const eventType = request.headers.get('x-webhook-event')

  if (!signature || !timestamp || !eventType) {
    return NextResponse.json({ error: 'Missing webhook headers' }, { status: 400 })
  }

  // Le secret de webhook est OBLIGATOIRE : sans lui, impossible de garantir
  // l'authenticité de la requête → on refuse tout traitement.
  const webhookSecret = process.env.GENIUSPAY_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[GeniusPay] GENIUSPAY_WEBHOOK_SECRET is not configured — webhook rejected')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const isValid = verifyWebhookSignature(rawBody, signature, timestamp, webhookSecret)
  if (!isValid) {
    console.error('[GeniusPay] Invalid webhook signature')
    await recordWebhookEvent({
      eventType,
      signatureValid: false,
      status: 'failed',
      error: 'Signature invalide',
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Replay attack protection — reject timestamps older than 5 minutes
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    return NextResponse.json({ error: 'Timestamp too old' }, { status: 400 })
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

        // Idempotence : éviter une double activation sur rejeu du webhook
        const reference = data?.reference
        if (reference && (await isReferenceApplied(reference))) {
          console.log(`[GeniusPay] Reference ${reference} already applied — skipping`)
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

        await recordSubscriptionPayment({
          companyId: metadata.companyId,
          reference: data?.reference || null,
          planName: fullPlanName,
          amount: Number(data?.amount) || 0,
          currency: data?.currency || 'XOF',
          months,
          status: 'completed',
          provider: 'geniuspay',
        })

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
          await recordSubscriptionPayment({
            companyId: metadata.companyId,
            reference: data?.reference || null,
            planName: metadata.planName || 'Abonnement',
            amount: Number(data?.amount) || 0,
            currency: data?.currency || 'XOF',
            months: parseInt(metadata.months, 10) || 1,
            status: 'failed',
            provider: 'geniuspay',
          })
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

    await recordWebhookEvent({
      eventType,
      reference: data?.reference || null,
      signatureValid: true,
      status: 'processed',
      payload,
    })
  } catch (error) {
    console.error(`[GeniusPay] Error handling event ${eventType}:`, error)
    await recordWebhookEvent({
      eventType,
      signatureValid: true,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Erreur de traitement',
      payload,
    })
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
