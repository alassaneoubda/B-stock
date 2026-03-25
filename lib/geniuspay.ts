// GeniusPay API Client — https://pay.genius.ci/docs/api

const BASE_URL = process.env.GENIUSPAY_BASE_URL || 'https://pay.genius.ci/api/v1/merchant'
const API_KEY = process.env.GENIUSPAY_API_KEY || ''
const API_SECRET = process.env.GENIUSPAY_API_SECRET || ''

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
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`GeniusPay API error (${res.status}): ${errorText}`)
  }

  return res.json()
}

// ===== Webhook Signature Verification =====

import { createHmac, timingSafeEqual } from 'crypto'

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

// ===== Plans Configuration =====

export type PlanInterval = 'monthly' | 'quarterly' | 'semiannual' | 'yearly'

export interface PlanPrice {
  interval: PlanInterval
  months: number
  price: number
  label: string
}

export interface Plan {
  id: string
  name: string
  description: string
  popular?: boolean
  features: string[]
  prices: PlanPrice[]
}

export const PLANS: Plan[] = [
  {
    id: 'essentiel',
    name: 'Pack Essentiel',
    description: 'Pour les petits commerces et dépôts',
    features: [
      'Gestion des ventes',
      'Gestion du stock',
      'Gestion des clients',
      'Factures automatiques',
      'Support email',
    ],
    prices: [
      { interval: 'monthly', months: 1, price: 25000, label: '25 000 XOF / mois' },
      { interval: 'quarterly', months: 3, price: 70000, label: '70 000 XOF / 3 mois' },
      { interval: 'semiannual', months: 6, price: 130000, label: '130 000 XOF / 6 mois' },
      { interval: 'yearly', months: 12, price: 250000, label: '250 000 XOF / an' },
    ],
  },
  {
    id: 'business',
    name: 'Pack Business',
    description: 'Pour les distributeurs et grossistes',
    popular: true,
    features: [
      'Tout du Pack Essentiel',
      'Multi-dépôts',
      'Rapports avancés',
      'Gestion des tournées',
      'Support prioritaire',
      'Accès API',
    ],
    prices: [
      { interval: 'monthly', months: 1, price: 45000, label: '45 000 XOF / mois' },
      { interval: 'quarterly', months: 3, price: 130000, label: '130 000 XOF / 3 mois' },
      { interval: 'semiannual', months: 6, price: 250000, label: '250 000 XOF / 6 mois' },
      { interval: 'yearly', months: 12, price: 500000, label: '500 000 XOF / an' },
    ],
  },
  {
    id: 'entreprise',
    name: 'Pack Entreprise',
    description: 'Pour les grandes entreprises — accès complet',
    features: [
      'Tout du Pack Business',
      'Utilisateurs illimités',
      'Dépôts illimités',
      'Branding personnalisé',
      'Formation dédiée',
      'Support dédié 24/7',
    ],
    prices: [
      { interval: 'yearly', months: 12, price: 0, label: '0 XOF / an' },
    ],
  },
]

export function getPlan(planId: string): Plan | undefined {
  return PLANS.find((p) => p.id === planId)
}

export function getPlanPrice(planId: string, interval: PlanInterval): PlanPrice | undefined {
  const plan = getPlan(planId)
  if (!plan) return undefined
  return plan.prices.find((p) => p.interval === interval)
}

export function formatXOF(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(amount)
}
