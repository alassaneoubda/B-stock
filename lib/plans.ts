import { sql } from './db'

export type PlanInterval = 'monthly' | 'quarterly' | 'semiannual' | 'yearly'

/**
 * paid     : paiement GeniusPay obligatoire
 * free     : activation directe, sans paiement
 * on_quote : sur devis — jamais activable par le client (l'admin l'attribue)
 */
export type PricingType = 'paid' | 'free' | 'on_quote'

export interface PlanPrice {
  interval: PlanInterval
  months: number
  price: number
  label: string
}

export interface Plan {
  id: string // = subscription_plans.name (slug, stable identifier)
  name: string // display name shown to users
  description: string
  popular: boolean
  pricingType: PricingType
  features: string[]
  prices: PlanPrice[]
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}

function mapRow(row: any): Plan {
  const pricingType: PricingType =
    row.pricing_type === 'free' || row.pricing_type === 'on_quote' ? row.pricing_type : 'paid'
  return {
    id: row.name,
    name: row.display_name || row.name,
    description: row.description || '',
    popular: row.is_popular === true,
    pricingType,
    features: parseJson<string[]>(row.marketing_features, []),
    prices:
      pricingType === 'on_quote'
        ? []
        : parseJson<PlanPrice[]>(row.checkout_prices, []).map((p) => ({
            interval: p.interval,
            months: Number(p.months),
            price: Number(p.price),
            label: p.label,
          })),
  }
}

/**
 * Public plans for the pricing/checkout page (active + public).
 * Les plans « sur devis » sont listés (sans prix) pour l'affichage.
 */
export async function getPublicPlans(): Promise<Plan[]> {
  const rows = await sql`
    SELECT name, display_name, description, is_popular, pricing_type,
           marketing_features, checkout_prices
    FROM subscription_plans
    WHERE is_active = true AND is_public = true
      AND (checkout_prices IS NOT NULL OR pricing_type = 'on_quote')
    ORDER BY sort_order ASC, price_monthly ASC
  `
  return rows.map(mapRow)
}

/**
 * Plan souscriptible par un client (actif ET public). Null sinon.
 */
export async function getPlanById(id: string): Promise<Plan | null> {
  const rows = await sql`
    SELECT name, display_name, description, is_popular, pricing_type,
           marketing_features, checkout_prices
    FROM subscription_plans
    WHERE name = ${id} AND is_active = true AND is_public = true
  `
  if (!rows[0]) return null
  return mapRow(rows[0])
}

/**
 * Resolve the price of a plan for a given interval (server-side trusted source).
 */
export async function getPlanPrice(
  id: string,
  interval: PlanInterval
): Promise<PlanPrice | null> {
  const plan = await getPlanById(id)
  if (!plan) return null
  return plan.prices.find((p) => p.interval === interval) ?? null
}
