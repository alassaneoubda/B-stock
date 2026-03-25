import { sql } from './db'

export type SubscriptionInfo = {
  isActive: boolean
  status: 'trialing' | 'active' | 'expired' | 'past_due' | 'canceled' | 'not_found'
  planName: string | null
  daysRemaining: number
  endsAt: string | null
  trialEndsAt: string | null
}

/**
 * Get full subscription info for a company.
 * Checks trial AND paid subscription expiry.
 */
export async function getSubscriptionInfo(companyId: string): Promise<SubscriptionInfo> {
  const companies = await sql`
    SELECT c.subscription_status, c.trial_ends_at, c.subscription_ends_at,
           sp.name as plan_name
    FROM companies c
    LEFT JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
    WHERE c.id = ${companyId}
  `

  const company = companies[0]
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

  const now = new Date()

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

/**
 * Activate a paid subscription for a company after successful payment.
 */
export async function activateSubscription(
  companyId: string,
  planName: string,
  months: number,
  paymentReference?: string
) {
  const endsAt = new Date()
  endsAt.setMonth(endsAt.getMonth() + months)

  await sql`
    UPDATE companies SET
      subscription_status = 'active',
      subscription_plan_name = ${planName},
      subscription_ends_at = ${endsAt.toISOString()},
      stripe_subscription_id = COALESCE(${paymentReference ?? null}, stripe_subscription_id),
      updated_at = NOW()
    WHERE id = ${companyId}
  `

  return { endsAt: endsAt.toISOString() }
}
