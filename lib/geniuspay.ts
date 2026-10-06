// GeniusPay API Client — https://pay.genius.ci/docs/api
import { createHmac, timingSafeEqual } from 'crypto'

const BASE_URL = process.env.GENIUSPAY_BASE_URL || 'https://pay.genius.ci/api/v1/merchant'
const API_KEY = process.env.GENIUSPAY_API_KEY || ''
const API_SECRET = process.env.GENIUSPAY_API_SECRET || ''

/** Délai maximal d'un appel à GeniusPay (évite de bloquer une requête utilisateur). */
const REQUEST_TIMEOUT_MS = 15_000

export function isGeniusPayConfigured(): boolean {
  return API_KEY.length > 5 && API_SECRET.length > 5
}

// ===== API Calls =====

interface CreatePaymentParams {
  amount: number
  description: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  successUrl: string
  errorUrl: string
  metadata?: Record<string, string>
}

interface GeniusPayResponse {
  success: boolean
  data: {
    id: number
    reference: string
    amount: number
    currency: string
    fees?: number
    net_amount?: number
    status: string
    checkout_url?: string
    payment_url?: string
    environment: string
    expires_at?: string
  }
}

/**
 * Create a payment via GeniusPay API (checkout mode — no payment_method specified).
 * Returns a checkout_url where the user can choose their payment method.
 */
export async function createPayment(params: CreatePaymentParams): Promise<GeniusPayResponse> {
  const body: Record<string, any> = {
    amount: params.amount,
    currency: 'XOF',
    description: params.description,
    success_url: params.successUrl,
    error_url: params.errorUrl,
  }

  if (params.customerName || params.customerEmail || params.customerPhone) {
    body.customer = {}
    if (params.customerName) body.customer.name = params.customerName
    if (params.customerEmail) body.customer.email = params.customerEmail
    if (params.customerPhone) body.customer.phone = params.customerPhone
  }

  if (params.metadata) {
    body.metadata = params.metadata
  }

  const res = await fetch(`${BASE_URL}/payments`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'X-API-Secret': API_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`GeniusPay API error (${res.status}): ${errorText}`)
  }

  return res.json()
}

// ===== Payment Retrieval (server-side verification) =====

export type GeniusPayPaymentStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'expired'

export interface GeniusPayPayment {
  id: number
  reference: string
  amount: number
  currency: string
  status: GeniusPayPaymentStatus
  payment_method?: string | null
  metadata?: Record<string, string>
  completed_at?: string | null
}

/**
 * Retrieve a payment by its reference to verify its real status server-side.
 * GET /payments/{reference} — used to confirm a payment before activating a subscription.
 */
export async function getPayment(reference: string): Promise<GeniusPayPayment> {
  const res = await fetch(`${BASE_URL}/payments/${encodeURIComponent(reference)}`, {
    method: 'GET',
    headers: {
      'X-API-Key': API_KEY,
      'X-API-Secret': API_SECRET,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`GeniusPay API error (${res.status}): ${errorText}`)
  }

  const json = await res.json()
  return json.data as GeniusPayPayment
}

// ===== Webhook Signature Verification =====

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  const data = `${timestamp}.${payload}`
  const expectedSignature = createHmac('sha256', secret).update(data).digest('hex')

  try {
    return timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))
  } catch {
    return false
  }
}

export function formatXOF(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(amount)
}
