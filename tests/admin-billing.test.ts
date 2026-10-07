import { beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: async () => null }))
vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: async () => ({
    ok: true,
    session: { user: { id: 'admin-test', email: 'finance@test.local' } },
    adminId: 'admin-test',
    adminEmail: 'finance@test.local',
    role: 'super_admin',
  }),
  requireSuperAdmin: async () => ({
    ok: true,
    session: { user: { id: 'admin-test', email: 'finance@test.local' } },
    adminId: 'admin-test',
    adminEmail: 'finance@test.local',
    role: 'super_admin',
  }),
  logAdminAction: async () => {},
}))

import { sql } from '@/lib/db'
import { computeBillingMetrics } from '@/lib/billing-admin'
import { sendSubscriptionReminders } from '@/lib/subscription-reminders'
import { POST as manualPOST } from '@/app/api/admin/billing/manual/route'
import { POST as refundPOST } from '@/app/api/admin/billing/[id]/refund/route'
import { GET as receiptGET } from '@/app/api/admin/billing/[id]/receipt/route'
import { POST as verifyPOST } from '@/app/api/admin/billing/checkouts/[id]/verify/route'
import { createTenant } from './helpers'

const DAY = 86_400_000

function req(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/admin/billing', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function company(companyId: string) {
  const [c] = await sql`
    SELECT subscription_status, subscription_ends_at, subscription_plan_name FROM companies WHERE id = ${companyId}
  `
  return c
}

beforeAll(() => {
  // Ni email ni GeniusPay en test : on vérifie les replis.
  vi.stubEnv('RESEND_API_KEY', '')
  vi.stubEnv('EMAIL_FROM', '')
})

describe('Paiement manuel', () => {
  it('prolonge depuis la fin de la période en cours et attribue un reçu RC-', async () => {
    const t = await createTenant()
    const currentEnd = new Date(Date.now() + 20 * DAY)
    await sql`
      UPDATE companies SET subscription_status = 'active', subscription_ends_at = ${currentEnd.toISOString()}
      WHERE id = ${t.companyId}
    `
    const res = await manualPOST(
      req('POST', { companyId: t.companyId, planId: 'business', months: 3, amount: 120000, method: 'cash', note: 'Reçu en agence' })
    )
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.data.receiptNumber).toMatch(/^RC-\d{6}$/)
    expect(body.data.reference).toMatch(/^manual:/)

    const expected = new Date(currentEnd)
    expected.setMonth(expected.getMonth() + 3)
    const c = await company(t.companyId)
    expect(c.subscription_status).toBe('active')
    expect(Math.abs(new Date(c.subscription_ends_at).getTime() - expected.getTime())).toBeLessThan(2000)

    const [p] = await sql`SELECT * FROM subscription_payments WHERE id = ${body.data.paymentId}`
    expect(p.provider).toBe('manual')
    expect(p.status).toBe('completed')
    expect(p.receipt_number).toBe(body.data.receiptNumber)
    expect(p.recorded_by).toBe('finance@test.local')
    expect(p.metadata.methodLabel).toBe('Espèces')

    // Reçu imprimable : en-têtes de sécurité et numéro
    const r = await receiptGET(req('GET'), params(p.id))
    expect(r.status).toBe(200)
    expect(r.headers.get('content-security-policy')).toBe("default-src 'none'; style-src 'unsafe-inline'")
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    const html = await r.text()
    expect(html).toContain(body.data.receiptNumber)
    expect(html).toContain('Paiement reçu')
  })

  it('refuse un moyen de paiement inconnu et une référence déjà utilisée', async () => {
    const t = await createTenant()
    const bad = await manualPOST(req('POST', { companyId: t.companyId, planId: 'business', months: 1, amount: 1, method: 'bitcoin' }))
    expect(bad.status).toBe(400)
    const reference = `VIR-${randomUUID()}`
    const ok = await manualPOST(req('POST', { companyId: t.companyId, planId: 'business', months: 1, amount: 45000, method: 'transfer', reference }))
    expect(ok.status).toBe(201)
    const dup = await manualPOST(req('POST', { companyId: t.companyId, planId: 'business', months: 1, amount: 45000, method: 'transfer', reference }))
    expect(dup.status).toBe(409)
  })
})

describe('Remboursement', () => {
  it('retire la période payée et ne peut pas être appliqué deux fois', async () => {
    const t = await createTenant()
    const end = new Date(Date.now() + 70 * DAY)
    await sql`UPDATE companies SET subscription_status = 'active', subscription_ends_at = ${end.toISOString()} WHERE id = ${t.companyId}`
    const [p] = await sql`
      INSERT INTO subscription_payments (company_id, reference, plan_name, amount, months, status, provider)
      VALUES (${t.companyId}, ${`R-${randomUUID()}`}, 'Pack Business', 45000, 1, 'completed', 'geniuspay')
      RETURNING id
    `
    const res = await refundPOST(req('POST', { reason: 'Double paiement', revokeAccess: true }), params(p.id))
    const body = await res.json()
    expect(res.status).toBe(200)
    const expected = new Date(end)
    expected.setMonth(expected.getMonth() - 1)
    expect(Math.abs(new Date(body.data.subscriptionEndsAt).getTime() - expected.getTime())).toBeLessThan(2000)
    expect((await company(t.companyId)).subscription_status).toBe('active')

    const [row] = await sql`SELECT status, refunded_at, refund_reason FROM subscription_payments WHERE id = ${p.id}`
    expect(row.status).toBe('refunded')
    expect(row.refunded_at).not.toBeNull()
    expect(row.refund_reason).toBe('Double paiement')

    const again = await refundPOST(req('POST', { reason: 'Encore' }), params(p.id))
    expect(again.status).toBe(409)
  })

  it('annule l’abonnement si la période retirée tombe dans le passé (jamais avant maintenant)', async () => {
    const t = await createTenant()
    const end = new Date(Date.now() + 10 * DAY)
    await sql`UPDATE companies SET subscription_status = 'active', subscription_ends_at = ${end.toISOString()} WHERE id = ${t.companyId}`
    const [p] = await sql`
      INSERT INTO subscription_payments (company_id, reference, plan_name, amount, months, status, provider)
      VALUES (${t.companyId}, ${`R-${randomUUID()}`}, 'Pack Business', 45000, 1, 'completed', 'geniuspay')
      RETURNING id
    `
    const before = Date.now()
    const res = await refundPOST(req('POST', { reason: 'Client mécontent' }), params(p.id)) // revokeAccess par défaut
    expect(res.status).toBe(200)
    const c = await company(t.companyId)
    expect(c.subscription_status).toBe('canceled')
    expect(new Date(c.subscription_ends_at).getTime()).toBeGreaterThanOrEqual(before - 5000)
    expect(new Date(c.subscription_ends_at).getTime()).toBeLessThanOrEqual(Date.now() + 1000)
  })

  it('motif obligatoire ; sans revokeAccess la période est conservée', async () => {
    const t = await createTenant()
    const end = new Date(Date.now() + 40 * DAY)
    await sql`UPDATE companies SET subscription_status = 'active', subscription_ends_at = ${end.toISOString()} WHERE id = ${t.companyId}`
    const [p] = await sql`
      INSERT INTO subscription_payments (company_id, reference, plan_name, amount, months, status, provider)
      VALUES (${t.companyId}, ${`R-${randomUUID()}`}, 'Pack Business', 45000, 1, 'completed', 'geniuspay')
      RETURNING id
    `
    expect((await refundPOST(req('POST', {}), params(p.id))).status).toBe(400)
    const res = await refundPOST(req('POST', { reason: 'Geste commercial', revokeAccess: false }), params(p.id))
    expect(res.status).toBe(200)
    const c = await company(t.companyId)
    expect(Math.abs(new Date(c.subscription_ends_at).getTime() - end.getTime())).toBeLessThan(2000)
  })
})

describe('Relances d’échéance', () => {
  it('une seule relance d7 même si la tâche tourne deux fois (email absent → in-app)', async () => {
    const t = await createTenant()
    // Fin dans 7 jours (midi UTC pour rester sur la bonne date)
    await sql`
      UPDATE companies SET subscription_status = 'active',
        subscription_ends_at = (CURRENT_DATE + 7) + TIME '12:00'
      WHERE id = ${t.companyId}
    `
    await sendSubscriptionReminders()
    await sendSubscriptionReminders()

    const reminders = await sql`SELECT kind, channel, status FROM subscription_reminders WHERE company_id = ${t.companyId}`
    expect(reminders).toHaveLength(1)
    expect(reminders[0]).toMatchObject({ kind: 'd7', channel: 'in_app', status: 'skipped' })

    const ann = await sql`
      SELECT level, audience, dismissible, ends_at::date - CURRENT_DATE AS days
      FROM announcements WHERE target_company_id = ${t.companyId}
    `
    expect(ann).toHaveLength(1)
    expect(ann[0]).toMatchObject({ level: 'warning', audience: 'company', dismissible: true, days: 10 })
  })

  it('paliers d3 / d0 / expired pour un essai', async () => {
    const ids: Record<string, string> = {}
    for (const [kind, offset] of [['d3', 3], ['d0', 0], ['expired', -1], ['none', 5]] as const) {
      const t = await createTenant()
      ids[kind] = t.companyId
      await sql`
        UPDATE companies SET subscription_status = 'trialing', trial_ends_at = (CURRENT_DATE + ${offset}::int) + TIME '12:00'
        WHERE id = ${t.companyId}
      `
    }
    await sendSubscriptionReminders()
    for (const kind of ['d3', 'd0', 'expired']) {
      const rows = await sql`SELECT kind FROM subscription_reminders WHERE company_id = ${ids[kind]}`
      expect(rows.map((r) => r.kind)).toEqual([kind])
    }
    expect(await sql`SELECT 1 FROM subscription_reminders WHERE company_id = ${ids.none}`).toHaveLength(0)
  })
})

describe('Indicateurs de revenu', () => {
  it('MRR normalisé au mois, ARR, ARPA, conversion', async () => {
    const a = await createTenant('MRR A')
    const b = await createTenant('MRR B')
    const c = await createTenant('MRR C') // essai, jamais payé
    const future = new Date(Date.now() + 100 * DAY).toISOString()
    await sql`UPDATE companies SET subscription_status = 'active', subscription_ends_at = ${future} WHERE id IN (${a.companyId}, ${b.companyId})`
    // A : ancien mensuel 30 000 puis annuel 120 000 → seul le dernier compte : 10 000 / mois
    await sql`
      INSERT INTO subscription_payments (company_id, reference, plan_name, amount, months, status, provider, created_at)
      VALUES
        (${a.companyId}, ${`M-${randomUUID()}`}, 'P', 30000, 1, 'completed', 'geniuspay', NOW() - INTERVAL '40 days'),
        (${a.companyId}, ${`M-${randomUUID()}`}, 'P', 120000, 12, 'completed', 'geniuspay', NOW() - INTERVAL '1 day'),
        (${b.companyId}, ${`M-${randomUUID()}`}, 'P', 45000, 1, 'completed', 'geniuspay', NOW() - INTERVAL '2 days'),
        (${b.companyId}, ${`M-${randomUUID()}`}, 'P', 99000, 1, 'failed', 'geniuspay', NOW())
    `
    const m = await computeBillingMetrics({ companyIds: [a.companyId, b.companyId, c.companyId] })
    expect(m.mrr).toBe(10000 + 45000)
    expect(m.arr).toBe(55000 * 12)
    expect(m.payingCompanies).toBe(2)
    expect(m.arpa).toBe(27500)
    expect(m.conversion90d).toMatchObject({ created: 3, converted: 2 })
    expect(m.conversion90d.rate).toBeCloseTo(2 / 3)
    expect(m.churn30d.churned).toBe(0)
  })

  it('churn : entreprise payante dont la période s’est terminée sans renouvellement', async () => {
    const t = await createTenant('Churn')
    await sql`
      UPDATE companies SET subscription_status = 'active', subscription_ends_at = NOW() - INTERVAL '5 days'
      WHERE id = ${t.companyId}
    `
    await sql`
      INSERT INTO subscription_payments (company_id, reference, plan_name, amount, months, status, provider, created_at)
      VALUES (${t.companyId}, ${`C-${randomUUID()}`}, 'P', 45000, 1, 'completed', 'geniuspay', NOW() - INTERVAL '35 days')
    `
    const m = await computeBillingMetrics({ companyIds: [t.companyId] })
    expect(m.mrr).toBe(0)
    expect(m.churn30d).toMatchObject({ churned: 1, base: 1, rate: 1 })
  })
})

describe('Vérification d’un paiement en attente', () => {
  it('GeniusPay non configuré : reste en attente sans planter', async () => {
    const t = await createTenant()
    const [co] = await sql`
      INSERT INTO subscription_checkouts (company_id, reference, plan_id, plan_name, billing_interval, months, amount)
      VALUES (${t.companyId}, ${`CK-${randomUUID()}`}, 'business', 'Pack Business — Mensuel', 'monthly', 1, 45000)
      RETURNING id
    `
    const res = await verifyPOST(req('POST'), params(co.id))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.status).toBe('pending')
    expect(body.applied).toBe(false)
    expect(body.checkout.status).toBe('pending')
  })
})
