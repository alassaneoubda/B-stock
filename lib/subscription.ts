import { sql, withTransaction } from './db'

export type SubscriptionInfo = {
  isActive: boolean
  status: 'trialing' | 'active' | 'expired' | 'past_due' | 'canceled' | 'not_found'
  planName: string | null
  daysRemaining: number
  endsAt: string | null
  trialEndsAt: string | null
}

export type SubscriptionRow = {
  subscription_status: string | null
  trial_ends_at: string | Date | null
  subscription_ends_at: string | Date | null
  plan_name?: string | null
}

/**
 * Get full subscription info for a company.
 * Checks trial AND paid subscription expiry.
 */
export async function getSubscriptionInfo(companyId: string): Promise<SubscriptionInfo> {
  const companies = await sql`
    SELECT c.subscription_status, c.trial_ends_at, c.subscription_ends_at,
           COALESCE(c.subscription_plan_name, sp.display_name, sp.name) as plan_name
    FROM companies c
    LEFT JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
    WHERE c.id = ${companyId}
  `

  const company = companies[0] as SubscriptionRow | undefined
  if (!company) {
    return {
      isActive: false,
      status: 'not_found',
      planName: null,
      daysRemaining: 0,
      endsAt: null,
      trialEndsAt: null,
    }
  }

  return evaluateSubscription(company)
}

/**
 * Calcule l'état d'abonnement à partir d'une ligne `companies` (fonction pure,
 * utilisée par getSubscriptionInfo et par le contrôle d'accès API).
 */
export function evaluateSubscription(company: SubscriptionRow, now = new Date()): SubscriptionInfo {

  // 1. Trialing
  if (company.subscription_status === 'trialing') {
    if (!company.trial_ends_at) {
      return {
        isActive: false,
        status: 'expired',
        planName: 'Free Trial',
        daysRemaining: 0,
        endsAt: null,
        trialEndsAt: null,
      }
    }
    const trialEnds = new Date(company.trial_ends_at)
    const diff = trialEnds.getTime() - now.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

    if (days <= 0) {
      return {
        isActive: false,
        status: 'expired',
        planName: 'Free Trial',
        daysRemaining: 0,
        endsAt: trialEnds.toISOString(),
        trialEndsAt: trialEnds.toISOString(),
      }
    }

    return {
      isActive: true,
      status: 'trialing',
      planName: 'Free Trial',
      daysRemaining: days,
      endsAt: trialEnds.toISOString(),
      trialEndsAt: trialEnds.toISOString(),
    }
  }

  // 2. Active paid plan
  if (company.subscription_status === 'active') {
    const planName = company.plan_name || 'Abonnement actif'

    if (!company.subscription_ends_at) {
      // Active without end date = unlimited (e.g. Pack Entreprise free)
      return {
        isActive: true,
        status: 'active',
        planName,
        daysRemaining: 999,
        endsAt: null,
        trialEndsAt: company.trial_ends_at ? new Date(company.trial_ends_at).toISOString() : null,
      }
    }

    const endsAt = new Date(company.subscription_ends_at)
    const diff = endsAt.getTime() - now.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

    if (days <= 0) {
      // Subscription expired
      return {
        isActive: false,
        status: 'expired',
        planName,
        daysRemaining: 0,
        endsAt: endsAt.toISOString(),
        trialEndsAt: company.trial_ends_at ? new Date(company.trial_ends_at).toISOString() : null,
      }
    }

    return {
      isActive: true,
      status: 'active',
      planName,
      daysRemaining: days,
      endsAt: endsAt.toISOString(),
      trialEndsAt: company.trial_ends_at ? new Date(company.trial_ends_at).toISOString() : null,
    }
  }

  // 3. past_due or canceled
  return {
    isActive: false,
    status: (company.subscription_status as 'past_due' | 'canceled') || 'expired',
    planName: company.plan_name || null,
    daysRemaining: 0,
    endsAt: company.subscription_ends_at ? new Date(company.subscription_ends_at).toISOString() : null,
    trialEndsAt: company.trial_ends_at ? new Date(company.trial_ends_at).toISOString() : null,
  }
}

// ---------------------------------------------------------------------------
// Activation d'un abonnement payé
// ---------------------------------------------------------------------------

export const INTERVAL_LABELS: Record<string, string> = {
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  semiannual: 'Semestriel',
  yearly: 'Annuel',
}

export function fullPlanName(planName: string, interval?: string | null): string {
  return interval ? `${planName} — ${INTERVAL_LABELS[interval] || interval}` : planName
}

export type ApplyPaymentInput = {
  companyId: string
  /** subscription_plans.name (slug) */
  planId: string
  planName: string
  months: number
  amount: number
  currency?: string
  reference: string | null
  provider: 'geniuspay' | 'manual' | 'admin'
  metadata?: Record<string, unknown> | null
}

export type ApplyPaymentResult = { applied: boolean; endsAt: string | null }

/**
 * Applique un paiement d'abonnement, de façon ATOMIQUE et IDEMPOTENTE.
 *
 * - Idempotence : la ligne subscription_payments (référence unique) est insérée
 *   en premier ; si la référence existe déjà, rien n'est appliqué. Webhook,
 *   redirection et rejeu admin peuvent donc arriver dans n'importe quel ordre.
 * - Prolongation : la nouvelle période démarre à la fin de la période en cours
 *   (abonnement actif ou essai restant), jamais à « maintenant » : un client
 *   qui renouvelle en avance ne perd aucun jour.
 */
export async function applySubscriptionPayment(input: ApplyPaymentInput): Promise<ApplyPaymentResult> {
  if (!Number.isInteger(input.months) || input.months <= 0) {
    throw new Error(`Durée d'abonnement invalide : ${input.months}`)
  }

  return withTransaction(async (tx) => {
    const inserted = await tx.sql`
      INSERT INTO subscription_payments
        (company_id, reference, plan_name, amount, currency, months, status, provider, metadata)
      VALUES (
        ${input.companyId}, ${input.reference}, ${input.planName}, ${input.amount},
        ${input.currency ?? 'XOF'}, ${input.months}, 'completed', ${input.provider},
        ${input.metadata ? JSON.stringify(input.metadata) : null}
      )
      ON CONFLICT (reference) DO NOTHING
      RETURNING id
    `
    if (inserted.length === 0) return { applied: false, endsAt: null }

    const [company] = await tx.sql`
      SELECT subscription_status, trial_ends_at, subscription_ends_at
      FROM companies WHERE id = ${input.companyId} FOR UPDATE
    `
    if (!company) throw new Error(`Entreprise introuvable : ${input.companyId}`)

    const now = Date.now()
    const candidates = [now]
    if (company.subscription_status === 'active' && company.subscription_ends_at) {
      candidates.push(new Date(company.subscription_ends_at).getTime())
    }
    if (company.subscription_status === 'trialing' && company.trial_ends_at) {
      candidates.push(new Date(company.trial_ends_at).getTime())
    }
    const endsAt = new Date(Math.max(...candidates))
    endsAt.setMonth(endsAt.getMonth() + input.months)

    const [plan] = await tx.sql`SELECT id FROM subscription_plans WHERE name = ${input.planId}`

    await tx.sql`
      UPDATE companies SET
        subscription_status = 'active',
        subscription_plan_name = ${input.planName},
        subscription_plan_id = COALESCE(${plan?.id ?? null}::uuid, subscription_plan_id),
        subscription_ends_at = ${endsAt.toISOString()},
        stripe_subscription_id = COALESCE(${input.reference}, stripe_subscription_id),
        updated_at = NOW()
      WHERE id = ${input.companyId}
    `

    if (input.reference) {
      await tx.sql`
        UPDATE subscription_checkouts
        SET status = 'completed', provider_status = 'completed', completed_at = NOW(), updated_at = NOW()
        WHERE reference = ${input.reference}
      `
    }

    return { applied: true, endsAt: endsAt.toISOString() }
  })
}

/**
 * Enregistre un paiement échoué dans l'historique. N'affecte PAS l'accès :
 * un échec de paiement ne doit pas couper un abonnement ou un essai en cours
 * (l'expiration naturelle s'en charge).
 */
export async function recordFailedSubscriptionPayment(input: {
  companyId: string
  reference: string | null
  planName: string
  amount: number
  currency?: string
  months: number
}): Promise<void> {
  try {
    await sql`
      INSERT INTO subscription_payments
        (company_id, reference, plan_name, amount, currency, months, status, provider)
      VALUES (
        ${input.companyId}, ${input.reference}, ${input.planName}, ${input.amount},
        ${input.currency ?? 'XOF'}, ${input.months}, 'failed', 'geniuspay'
      )
      ON CONFLICT (reference) DO NOTHING
    `
    if (input.reference) {
      await sql`
        UPDATE subscription_checkouts SET status = 'failed', provider_status = 'failed', updated_at = NOW()
        WHERE reference = ${input.reference} AND status = 'pending'
      `
    }
  } catch (e) {
    console.error('[subscription] recordFailedSubscriptionPayment failed:', e)
  }
}

/**
 * Record a subscription payment in the billing history (octroi manuel par un admin).
 * Best-effort and idempotent on `reference`.
 */
export async function recordSubscriptionPayment(input: {
  companyId: string
  reference?: string | null
  planName: string
  amount: number
  currency?: string
  months: number
  status?: 'completed' | 'failed' | 'refunded' | 'manual'
  provider?: 'geniuspay' | 'manual' | 'admin'
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  try {
    await sql`
      INSERT INTO subscription_payments
        (company_id, reference, plan_name, amount, currency, months, status, provider, metadata)
      VALUES (
        ${input.companyId}, ${input.reference ?? null}, ${input.planName}, ${input.amount},
        ${input.currency ?? 'XOF'}, ${input.months}, ${input.status ?? 'completed'},
        ${input.provider ?? 'geniuspay'}, ${input.metadata ? JSON.stringify(input.metadata) : null}
      )
      ON CONFLICT (reference) DO NOTHING
    `
  } catch (e) {
    console.error('[subscription] recordSubscriptionPayment failed:', e)
  }
}
