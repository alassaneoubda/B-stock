import { sql } from '../db'
import { verifyWebhookSignature } from '../geniuspay'
import { recordWebhookEvent } from '../webhooks'
import { reconcileRequest } from './requests'
import { findWebhookTarget } from './settings'

/**
 * Webhook GeniusPay d'une entreprise : /api/payments/mobile-money/webhook/[companyToken]
 *
 * 1. Le jeton opaque de l'URL désigne l'entreprise (jamais son UUID).
 * 2. Signature HMAC-SHA256 vérifiée avec le secret de webhook DE L'ENTREPRISE
 *    (mêmes en-têtes et même schéma que le webhook d'abonnement).
 * 3. Fenêtre anti-rejeu de 5 minutes sur l'horodatage signé.
 * 4. Le contenu du webhook ne fait PAS foi : il ne sert qu'à désigner la
 *    demande, dont le statut est relu auprès de l'API GeniusPay avant toute
 *    imputation (reconcileRequest). Rejouer le webhook est donc sans effet.
 */

const MAX_AGE_SECONDS = 300
/** Fournisseur distinct dans webhook_events (≠ abonnements de la plateforme). */
const PROVIDER = 'geniuspay_merchant'

export type WebhookResult = { status: number; body: Record<string, unknown> }

export async function handleMerchantWebhook(input: {
  token: string
  rawBody: string
  headers: Headers
}): Promise<WebhookResult> {
  const signature = input.headers.get('x-webhook-signature')
  const timestamp = input.headers.get('x-webhook-timestamp')
  const eventType = input.headers.get('x-webhook-event')

  if (!signature || !timestamp || !eventType) {
    return { status: 400, body: { error: 'Missing webhook headers' } }
  }

  let target: Awaited<ReturnType<typeof findWebhookTarget>>
  try {
    target = await findWebhookTarget(input.token)
  } catch (e) {
    // Clé de chiffrement absente ou secret illisible : on ne peut pas vérifier
    console.error('[mobile-money] secret de webhook indisponible', e)
    return { status: 503, body: { error: 'Webhook not available' } }
  }
  if (!target) {
    return { status: 404, body: { error: 'Unknown webhook' } }
  }

  if (!/^\d{9,11}$/.test(timestamp)) {
    return { status: 400, body: { error: 'Invalid timestamp' } }
  }

  if (!verifyWebhookSignature(input.rawBody, signature, timestamp, target.webhookSecret)) {
    await recordWebhookEvent({ provider: PROVIDER, eventType, signatureValid: false, status: 'failed', error: 'Signature invalide' })
    return { status: 401, body: { error: 'Invalid signature' } }
  }

  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(timestamp)) > MAX_AGE_SECONDS) {
    await recordWebhookEvent({ provider: PROVIDER, eventType, signatureValid: true, status: 'failed', error: 'Horodatage trop ancien' })
    return { status: 400, body: { error: 'Timestamp too old' } }
  }

  let payload: any
  try {
    payload = JSON.parse(input.rawBody)
  } catch {
    return { status: 400, body: { error: 'Invalid JSON' } }
  }
  const data = payload?.data ?? {}
  const reference: string | null = typeof data?.reference === 'string' ? data.reference.slice(0, 120) : null

  // La demande est cherchée DANS l'entreprise du jeton : un webhook signé par
  // une entreprise ne peut jamais toucher une demande d'une autre.
  const [request] = reference
    ? await sql`
        SELECT id FROM mobile_money_payments
        WHERE company_id = ${target.companyId} AND provider = 'geniuspay' AND provider_reference = ${reference}
      `
    : []

  if (!request) {
    // Paiement étranger à B-Stock (autre usage du compte marchand) : accusé de réception
    await recordWebhookEvent({
      provider: PROVIDER, eventType, reference, signatureValid: true, status: 'ignored',
      error: 'Aucune demande B-Stock pour cette référence',
    })
    return { status: 200, body: { received: true } }
  }

  try {
    const outcome = await reconcileRequest(request.id, { companyId: target.companyId, source: 'webhook' })
    // Journal sans données personnelles (ni payload, ni numéro du client)
    await recordWebhookEvent({
      provider: PROVIDER,
      eventType,
      reference,
      signatureValid: true,
      status: outcome.applied ? 'processed' : 'ignored',
      error: outcome.applied ? null : outcome.applyError ?? `Statut vérifié : ${outcome.status}`,
    })
    return { status: 200, body: { received: true, status: outcome.status } }
  } catch (e) {
    console.error('[mobile-money] traitement du webhook échoué', reference, e)
    await recordWebhookEvent({
      provider: PROVIDER, eventType, reference, signatureValid: true, status: 'failed',
      error: e instanceof Error ? e.message.slice(0, 300) : 'Erreur de traitement',
    })
    // 500 → GeniusPay renverra le webhook plus tard (le cron couvre aussi ce cas)
    return { status: 500, body: { error: 'Webhook handler error' } }
  }
}
