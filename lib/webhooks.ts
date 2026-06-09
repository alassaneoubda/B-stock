import { sql } from './db'

/**
 * Persist a received webhook event for monitoring / replay. Best-effort.
 */
export async function recordWebhookEvent(input: {
  provider?: string
  eventType?: string | null
  reference?: string | null
  signatureValid?: boolean | null
  status: 'received' | 'processed' | 'failed' | 'ignored' | 'replayed'
  error?: string | null
  payload?: unknown
}): Promise<void> {
  try {
    const processedAt =
      input.status === 'processed' || input.status === 'replayed' ? new Date().toISOString() : null
    await sql`
      INSERT INTO webhook_events
        (provider, event_type, reference, signature_valid, status, error, payload, processed_at)
      VALUES (
        ${input.provider ?? 'geniuspay'},
        ${input.eventType ?? null},
        ${input.reference ?? null},
        ${input.signatureValid ?? null},
        ${input.status},
        ${input.error ?? null},
        ${input.payload ? JSON.stringify(input.payload) : null},
        ${processedAt}
      )
    `
  } catch (e) {
    console.error('[webhooks] recordWebhookEvent failed:', e)
  }
}
