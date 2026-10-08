/**
 * Client GeniusPay paramétré par les identifiants D'UNE entreprise (compte
 * marchand de l'entreprise, et non celui de la plateforme — cf. lib/geniuspay.ts
 * pour les abonnements B-Stock). Mêmes endpoints et mêmes en-têtes.
 *
 * Endpoints utilisés (https://pay.genius.ci/docs/api) :
 *   POST /payments              création (mode checkout : le client choisit
 *                               Wave, Orange Money, MTN MoMo, Moov…)
 *   GET  /payments/{reference}  statut réel (source de vérité)
 *   GET  /payments?per_page=1   test des identifiants
 */

const DEFAULT_BASE_URL = 'https://pay.genius.ci/api/v1/merchant'
const REQUEST_TIMEOUT_MS = 15_000

export type MerchantCredentials = {
  apiKey: string
  apiSecret: string
}

export type ProviderPaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired' | 'cancelled'

export type ProviderPayment = {
  id?: number | string
  reference: string
  amount: number
  currency?: string
  status: ProviderPaymentStatus | string
  payment_method?: string | null
  environment?: string | null
  metadata?: Record<string, string> | null
  checkout_url?: string | null
  payment_url?: string | null
  expires_at?: string | null
  completed_at?: string | null
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

function baseUrl(): string {
  return (process.env.GENIUSPAY_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
}

function headers(creds: MerchantCredentials, json = false): Record<string, string> {
  const h: Record<string, string> = { 'X-API-Key': creds.apiKey, 'X-API-Secret': creds.apiSecret }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

async function readError(res: Response): Promise<ProviderError> {
  const text = await res.text().catch(() => '')
  // Le corps n'est jamais renvoyé tel quel au navigateur (journalisé côté serveur)
  return new ProviderError(`GeniusPay (${res.status}) ${text.slice(0, 300)}`, res.status)
}

export type CreateMerchantPaymentParams = {
  amount: number
  description: string
  customerName?: string
  customerPhone?: string
  successUrl: string
  errorUrl: string
  metadata: Record<string, string>
}

export async function createMerchantPayment(
  creds: MerchantCredentials,
  params: CreateMerchantPaymentParams
): Promise<ProviderPayment> {
  const body: Record<string, unknown> = {
    amount: params.amount,
    currency: 'XOF',
    description: params.description,
    success_url: params.successUrl,
    error_url: params.errorUrl,
    metadata: params.metadata,
  }
  if (params.customerName || params.customerPhone) {
    const customer: Record<string, string> = {}
    if (params.customerName) customer.name = params.customerName
    if (params.customerPhone) customer.phone = params.customerPhone
    body.customer = customer
  }

  const res = await fetch(`${baseUrl()}/payments`, {
    method: 'POST',
    headers: headers(creds, true),
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) throw await readError(res)
  const json = await res.json()
  return (json?.data ?? json) as ProviderPayment
}

export async function getMerchantPayment(creds: MerchantCredentials, reference: string): Promise<ProviderPayment> {
  const res = await fetch(`${baseUrl()}/payments/${encodeURIComponent(reference)}`, {
    method: 'GET',
    headers: headers(creds),
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) throw await readError(res)
  const json = await res.json()
  return (json?.data ?? json) as ProviderPayment
}

export type ConnectionTestResult = { ok: boolean; message: string; environment?: string | null }

/** Vérifie que GeniusPay accepte les identifiants (aucun paiement créé). */
export async function testMerchantCredentials(creds: MerchantCredentials): Promise<ConnectionTestResult> {
  let res: Response
  try {
    res = await fetch(`${baseUrl()}/payments?per_page=1`, {
      method: 'GET',
      headers: headers(creds),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    return { ok: false, message: 'GeniusPay est injoignable pour le moment. Réessayez dans un instant.' }
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, message: 'Identifiants refusés par GeniusPay : vérifiez la clé API et le secret.' }
  }
  if (!res.ok) {
    return { ok: false, message: `Réponse inattendue de GeniusPay (code ${res.status}).` }
  }
  const json = await res.json().catch(() => null)
  const environment = typeof json?.environment === 'string' ? json.environment : null
  return { ok: true, message: 'Connexion réussie : GeniusPay accepte vos identifiants.', environment }
}
