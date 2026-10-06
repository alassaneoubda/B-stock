import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/geniuspay'
import { handleEvent } from '@/lib/subscription-webhook'
import { recordWebhookEvent } from '@/lib/webhooks'

/** Fenêtre anti-rejeu : un webhook signé plus vieux que ça est refusé. */
const MAX_AGE_SECONDS = 300

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

  // Timestamp numérique obligatoire (un NaN contournait la fenêtre anti-rejeu)
  if (!/^\d{9,11}$/.test(timestamp)) {
    return NextResponse.json({ error: 'Invalid timestamp' }, { status: 400 })
  }

  const isValid = verifyWebhookSignature(rawBody, signature, timestamp, webhookSecret)
  if (!isValid) {
    console.error('[GeniusPay] Invalid webhook signature')
    await recordWebhookEvent({ eventType, signatureValid: false, status: 'failed', error: 'Signature invalide' })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(timestamp)) > MAX_AGE_SECONDS) {
    await recordWebhookEvent({ eventType, signatureValid: true, status: 'failed', error: 'Horodatage trop ancien' })
    return NextResponse.json({ error: 'Timestamp too old' }, { status: 400 })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const data = payload?.data
  const reference: string | null = data?.reference || null

  try {
    const outcome = await handleEvent(eventType, data)
    await recordWebhookEvent({
      eventType,
      reference,
      signatureValid: true,
      status: outcome === 'ignored' ? 'ignored' : 'processed',
      error: outcome === 'ignored' ? 'Événement sans effet (métadonnées absentes ou déjà traité)' : null,
      payload,
    })
  } catch (error) {
    console.error(`[GeniusPay] Error handling event ${eventType}:`, error)
    await recordWebhookEvent({
      eventType,
      reference,
      signatureValid: true,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Erreur de traitement',
      payload,
    })
    // 500 → GeniusPay renverra le webhook plus tard
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
