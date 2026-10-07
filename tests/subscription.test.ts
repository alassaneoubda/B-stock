import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { sql } from '@/lib/db'
import { getPlanById } from '@/lib/plans'
import { applySubscriptionPayment, getSubscriptionInfo } from '@/lib/subscription'
import { handleEvent } from '@/lib/subscription-webhook'
import { createTenant } from './helpers'

const DAY = 86_400_000

async function companyRow(companyId: string) {
  const [c] = await sql`
    SELECT subscription_status, subscription_ends_at, subscription_plan_id, subscription_plan_name
    FROM companies WHERE id = ${companyId}
  `
  return c
}

describe('Abonnement — application des paiements', () => {
  it('idempotent : la même référence appliquée deux fois ne prolonge qu’une fois', async () => {
    const t = await createTenant()
    const reference = `MTX-${randomUUID()}`
    const input = {
      companyId: t.companyId, planId: 'business', planName: 'Pack Business — Mensuel',
      months: 1, amount: 45000, reference, provider: 'geniuspay' as const,
    }
    const first = await applySubscriptionPayment(input)
    const second = await applySubscriptionPayment(input)
    expect(first.applied).toBe(true)
    expect(second.applied).toBe(false)

    const payments = await sql`SELECT 1 FROM subscription_payments WHERE reference = ${reference}`
    expect(payments).toHaveLength(1)
    const c = await companyRow(t.companyId)
    expect(c.subscription_status).toBe('active')
    expect(c.subscription_plan_id).not.toBeNull()
  })

  it('renouvellement anticipé : aucun jour perdu', async () => {
    const t = await createTenant()
    const endsIn20Days = new Date(Date.now() + 20 * DAY)
    await sql`
      UPDATE companies SET subscription_status = 'active', subscription_ends_at = ${endsIn20Days.toISOString()}
      WHERE id = ${t.companyId}
    `
    const result = await applySubscriptionPayment({
      companyId: t.companyId, planId: 'essentiel', planName: 'Pack Essentiel — Mensuel',
      months: 1, amount: 25000, reference: `MTX-${randomUUID()}`, provider: 'geniuspay',
    })
    const expected = new Date(endsIn20Days)
    expected.setMonth(expected.getMonth() + 1)
    expect(Math.abs(new Date(result.endsAt!).getTime() - expected.getTime())).toBeLessThan(5000)
  })

  it('les jours d’essai restants sont conservés lors du premier paiement', async () => {
    const t = await createTenant() // essai : 30 jours restants
    const result = await applySubscriptionPayment({
      companyId: t.companyId, planId: 'essentiel', planName: 'Pack Essentiel — Mensuel',
      months: 1, amount: 25000, reference: `MTX-${randomUUID()}`, provider: 'geniuspay',
    })
    const days = (new Date(result.endsAt!).getTime() - Date.now()) / DAY
    expect(days).toBeGreaterThan(55) // ~30 jours d'essai + 1 mois
  })
})

describe('Abonnement — webhook', () => {
  it('payment.failed ne coupe plus un essai en cours', async () => {
    const t = await createTenant()
    await handleEvent('payment.failed', {
      reference: `MTX-${randomUUID()}`, amount: 25000,
      metadata: { companyId: t.companyId, planId: 'essentiel', planName: 'Pack Essentiel', months: '1', interval: 'monthly' },
    })
    const info = await getSubscriptionInfo(t.companyId)
    expect(info.isActive).toBe(true)
    expect(info.status).toBe('trialing')
  })

  it('payment.success s’appuie sur le paiement initié et refuse un montant insuffisant', async () => {
    const t = await createTenant()
    const reference = `MTX-${randomUUID()}`
    await sql`
      INSERT INTO subscription_checkouts (company_id, reference, plan_id, plan_name, billing_interval, months, amount)
      VALUES (${t.companyId}, ${reference}, 'business', 'Pack Business — Annuel', 'yearly', 12, 500000)
    `
    await expect(
      handleEvent('payment.success', { reference, amount: 1000, metadata: { companyId: t.companyId } })
    ).rejects.toThrow(/inférieur/)

    expect(await handleEvent('payment.success', { reference, amount: 500000, currency: 'XOF', metadata: {} })).toBe('processed')
    const c = await companyRow(t.companyId)
    expect(c.subscription_plan_name).toBe('Pack Business — Annuel')
    const [checkout] = await sql`SELECT status FROM subscription_checkouts WHERE reference = ${reference}`
    expect(checkout.status).toBe('completed')
    // Rejeu du même webhook : sans effet
    expect(await handleEvent('payment.success', { reference, amount: 500000, metadata: {} })).toBe('ignored')
  })
})

describe('Plans', () => {
  it('le Pack Entreprise est « sur devis » et n’expose aucun prix activable', async () => {
    const plan = await getPlanById('entreprise')
    expect(plan?.pricingType).toBe('on_quote')
    expect(plan?.prices).toEqual([])
  })
})
