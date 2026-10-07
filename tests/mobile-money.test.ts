import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHmac, randomBytes } from 'node:crypto'
import { NextRequest } from 'next/server'
import { actAs, json, params, req } from './route-helpers'
import { sql } from '@/lib/db'
import { createSale } from '@/lib/domain/sales'
import { createProduct, createTenant } from './helpers'
import { decryptSecret, encryptSecret, CredentialsKeyMissingError } from '@/lib/crypto/secrets'
import { reconcileRequest } from '@/lib/mobile-money/requests'
import * as settingsRoute from '@/app/api/settings/payments/route'
import * as settingsTest from '@/app/api/settings/payments/test/route'
import * as mmRoute from '@/app/api/payments/mobile-money/route'
import * as mmGet from '@/app/api/payments/mobile-money/[id]/route'
import * as mmVerify from '@/app/api/payments/mobile-money/[id]/verify/route'
import * as mmWebhook from '@/app/api/payments/mobile-money/webhook/[companyToken]/route'
import * as cronRoute from '@/app/api/cron/reconcile-mobile-money/route'

vi.mock('@/lib/auth', () => ({ auth: async () => null }))

// Clé de chiffrement de test, générée en mémoire (jamais un fichier .env)
const TEST_KEY = randomBytes(32).toString('base64')
beforeAll(() => {
  process.env.PAYMENT_CREDENTIALS_KEY = TEST_KEY
})
afterEach(() => {
  process.env.PAYMENT_CREDENTIALS_KEY = TEST_KEY
})

// ---------------------------------------------------------------------------
// Faux GeniusPay (aucun appel réseau réel)
// ---------------------------------------------------------------------------

type FakePayment = {
  reference: string
  amount: number
  currency: string
  status: string
  environment: string
  metadata: Record<string, string>
  payment_method?: string
  apiKey: string
}
const fake = new Map<string, FakePayment>()
let seq = 0

const GOOD_KEY_PREFIX = 'pk_sandbox_'

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input))
  const hdrs = new Headers(init?.headers)
  const apiKey = hdrs.get('X-API-Key') || ''
  if (!apiKey.startsWith(GOOD_KEY_PREFIX)) {
    return new Response(JSON.stringify({ message: 'Unauthenticated' }), { status: 401 })
  }
  const path = url.pathname.replace(/^\/api\/v1\/merchant/, '')
  if (init?.method === 'POST' && path === '/payments') {
    const body = JSON.parse(String(init.body))
    const reference = `MTX-TEST-${Date.now()}-${++seq}`
    fake.set(reference, {
      reference, amount: body.amount, currency: body.currency, status: 'pending',
      environment: 'sandbox', metadata: body.metadata, apiKey,
    })
    return Response.json({
      success: true,
      data: { id: seq, reference, amount: body.amount, currency: 'XOF', status: 'pending', environment: 'sandbox',
        checkout_url: `https://pay.genius.ci/checkout/${reference}` },
    })
  }
  if (path === '/payments' && (init?.method ?? 'GET') === 'GET') {
    return Response.json({ success: true, data: [], environment: 'sandbox' })
  }
  const m = path.match(/^\/payments\/(.+)$/)
  if (m) {
    const p = fake.get(decodeURIComponent(m[1]))
    // Un compte marchand ne voit que ses propres paiements
    if (!p || p.apiKey !== apiKey) return new Response('{"message":"Not found"}', { status: 404 })
    const { apiKey: _k, ...data } = p
    return Response.json({ success: true, data })
  }
  return new Response('{}', { status: 404 })
})
vi.stubGlobal('fetch', fetchMock)

// ---------------------------------------------------------------------------
// Aides
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = 'whsec_test_secret_123456'

async function configure(t: { companyId: string; userId: string }, suffix = 'A1') {
  actAs(t)
  const res = await json(await settingsRoute.PUT(req('PUT', {
    enabled: true,
    environment: 'sandbox',
    apiKey: `${GOOD_KEY_PREFIX}key_${suffix}_9876`,
    apiSecret: `sk_sandbox_secret_${suffix}_4321`,
    webhookSecret: WEBHOOK_SECRET,
  })))
  expect(res.status).toBe(200)
  const token = res.body.data.webhookPath.split('/').pop() as string
  return { token, settings: res.body.data }
}

/** Entreprise configurée avec une vente à crédit de 2 000 FCFA (4 × 500). */
async function tenantWithCreditSale() {
  const t = await createTenant('MoMo')
  const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 20 }] })
  const { order } = await createSale({
    companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
    paymentMethod: 'credit', paidAmount: 0,
    items: [{ productVariantId: p.variantId, quantity: 4, unitPrice: 500 }],
  })
  const [credit] = await sql`SELECT id FROM credit_notes WHERE sales_order_id = ${order.id}`
  const { token } = await configure(t)
  return { ...t, orderId: order.id as string, creditId: credit.id as string, token }
}

async function createRequest(body: Record<string, unknown>) {
  return json(await mmRoute.POST(req('POST', body)))
}

function webhookRequest(token: string, payload: unknown, opts: { secret?: string; ts?: number; event?: string } = {}) {
  const raw = JSON.stringify(payload)
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', opts.secret ?? WEBHOOK_SECRET).update(`${ts}.${raw}`).digest('hex')
  return new NextRequest(`http://localhost/api/payments/mobile-money/webhook/${token}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-signature': signature,
      'x-webhook-timestamp': ts,
      'x-webhook-event': opts.event ?? 'payment.success',
    },
    body: raw,
  })
}

const callWebhook = (token: string, payload: unknown, opts?: Parameters<typeof webhookRequest>[2]) =>
  mmWebhook.POST(webhookRequest(token, payload, opts), { params: Promise.resolve({ companyToken: token }) })

async function mmPaymentsFor(requestId: string) {
  return sql`SELECT id, amount, payment_method, reference FROM payments WHERE mobile_money_payment_id = ${requestId}`
}

// ---------------------------------------------------------------------------

describe('Chiffrement des identifiants', () => {
  it('chiffre / déchiffre en AES-256-GCM, lié à son contexte', () => {
    const a = encryptSecret('sk_live_abcdef', 'company:1')
    const b = encryptSecret('sk_live_abcdef', 'company:1')
    expect(a).not.toBe(b) // IV aléatoire
    expect(a).not.toContain('sk_live_abcdef')
    expect(decryptSecret(a, 'company:1')).toBe('sk_live_abcdef')
    // Recopié sur une autre entreprise : indéchiffrable
    expect(() => decryptSecret(a, 'company:2')).toThrow()
    // Altéré : refusé (intégrité GCM)
    const parts = a.split('.')
    parts[3] = Buffer.from('autre-chose').toString('base64url')
    expect(() => decryptSecret(parts.join('.'), 'company:1')).toThrow()
  })

  it('sans PAYMENT_CREDENTIALS_KEY : fonctionnalité refusée proprement', async () => {
    delete process.env.PAYMENT_CREDENTIALS_KEY
    expect(() => encryptSecret('x', 'c')).toThrow(CredentialsKeyMissingError)
    const t = await createTenant()
    actAs(t)
    const res = await json(await settingsRoute.PUT(req('PUT', { apiKey: `${GOOD_KEY_PREFIX}abcdefgh` })))
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('PAYMENT_KEY_MISSING')
    const [row] = await sql`SELECT api_key_enc FROM company_payment_settings WHERE company_id = ${t.companyId}`
    expect(row?.api_key_enc ?? null).toBeNull()
  })

  it('les secrets sont stockés chiffrés et jamais renvoyés au navigateur', async () => {
    const t = await createTenant()
    const { settings } = await configure(t, 'ZZ')
    const [row] = await sql`SELECT * FROM company_payment_settings WHERE company_id = ${t.companyId}`
    expect(row.api_secret_enc).not.toContain('sk_sandbox_secret_ZZ_4321')
    expect(row.webhook_secret_enc).not.toContain(WEBHOOK_SECRET)

    const get = await json(await settingsRoute.GET())
    for (const body of [settings, get.body.data]) {
      const text = JSON.stringify(body)
      expect(text).not.toContain('sk_sandbox_secret_ZZ_4321')
      expect(text).not.toContain(WEBHOOK_SECRET)
      expect(text).not.toContain(`${GOOD_KEY_PREFIX}key_ZZ_9876`)
      expect(text).not.toContain(row.api_secret_enc)
    }
    expect(get.body.data.apiSecret).toEqual({ configured: true, last4: '4321' })
    expect(get.body.data.ready).toBe(true)
    // Jeton opaque dans l'URL du webhook, jamais l'UUID de l'entreprise
    expect(get.body.data.webhookPath).not.toContain(t.companyId)

    // Mise à jour sans secret : les anciens sont conservés
    const upd = await json(await settingsRoute.PUT(req('PUT', { environment: 'production', apiSecret: '' })))
    expect(upd.body.data.apiSecret.last4).toBe('4321')
    expect(upd.body.data.environment).toBe('production')
  })

  it('activation refusée sans identifiants complets', async () => {
    const t = await createTenant()
    actAs(t)
    const res = await json(await settingsRoute.PUT(req('PUT', { enabled: true, apiKey: `${GOOD_KEY_PREFIX}abcdefgh` })))
    expect(res.status).toBe(400)
  })

  it('« Tester la connexion » : identifiants acceptés ou refusés', async () => {
    const t = await createTenant()
    await configure(t)
    const ok = await json(await settingsTest.POST())
    expect(ok.body.data.ok).toBe(true)

    await settingsRoute.PUT(req('PUT', { apiKey: 'pk_wrong_key_123456' }))
    const ko = await json(await settingsTest.POST())
    expect(ko.body.data.ok).toBe(false)
    expect(ko.body.data.settings.lastTest.ok).toBe(false)
  })
})

describe('Demande de paiement', () => {
  it('montant supérieur au reste dû refusé ; montant valide → lien de paiement', async () => {
    const t = await tenantWithCreditSale()
    const tooMuch = await createRequest({ salesOrderId: t.orderId, amount: 2500 })
    expect(tooMuch.status).toBe(409)

    const ok = await createRequest({ salesOrderId: t.orderId, amount: 1500, customerPhone: '07 07 07 07 07' })
    expect(ok.status).toBe(201)
    expect(ok.body.data.status).toBe('pending')
    expect(ok.body.data.payment_url).toMatch(/^https:\/\/pay\.genius\.ci\//)
    expect(ok.body.data.customer_phone).toBe('2250707070707')
    // Les métadonnées envoyées au prestataire désignent la demande et l'entreprise
    const sent = fake.get(ok.body.data.provider_reference)!
    expect(sent.metadata).toMatchObject({ bstockPaymentId: ok.body.data.id, companyId: t.companyId })

    // 1 500 déjà demandés en attente : il ne reste que 500 demandables
    const over = await createRequest({ creditNoteId: t.creditId, amount: 1000 })
    expect(over.status).toBe(409)
    expect(over.body.error).toMatch(/déjà demandés/)
    const rest = await createRequest({ creditNoteId: t.creditId, amount: 500 })
    expect(rest.status).toBe(201)
  })

  it('isolation : une entreprise ne peut ni viser ni lire les données d’une autre', async () => {
    const a = await tenantWithCreditSale()
    actAs(a)
    const created = await createRequest({ creditNoteId: a.creditId, amount: 1000 })
    expect(created.status).toBe(201)

    const b = await createTenant('Autre')
    await configure(b, 'B2')
    expect((await createRequest({ creditNoteId: a.creditId, amount: 100 })).status).toBe(404)
    expect((await createRequest({ salesOrderId: a.orderId, amount: 100 })).status).toBe(404)
    expect((await json(await mmGet.GET(req('GET'), params(created.body.data.id)))).status).toBe(404)
    expect((await json(await mmVerify.POST(req('POST'), params(created.body.data.id)))).status).toBe(404)
    const list = await json(await mmRoute.GET(req('GET')))
    expect(list.body.data.find((r: any) => r.id === created.body.data.id)).toBeUndefined()

    // Le webhook de B ne peut pas toucher une demande de A, même signé
    fake.get(created.body.data.provider_reference)!.status = 'completed'
    const bToken = (await json(await settingsRoute.GET())).body.data.webhookPath.split('/').pop()
    const res = await callWebhook(bToken, { data: { reference: created.body.data.provider_reference } })
    expect(res.status).toBe(200)
    expect(await mmPaymentsFor(created.body.data.id)).toHaveLength(0)
  })

  it('refusée si l’entreprise n’a pas configuré Mobile Money', async () => {
    const t = await createTenant()
    actAs(t)
    const res = await createRequest({ salesOrderId: '00000000-0000-4000-8000-000000000000', amount: 100 })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('MOBILE_MONEY_NOT_CONFIGURED')
  })
})

describe('Rapprochement', () => {
  it('webhook à signature invalide refusé, sans effet', async () => {
    const t = await tenantWithCreditSale()
    const r = await createRequest({ creditNoteId: t.creditId, amount: 2000 })
    fake.get(r.body.data.provider_reference)!.status = 'completed'

    const bad = await callWebhook(t.token, { data: { reference: r.body.data.provider_reference } }, { secret: 'whsec_mauvais_secret' })
    expect(bad.status).toBe(401)
    const old = await callWebhook(t.token, { data: { reference: r.body.data.provider_reference } }, { ts: Math.floor(Date.now() / 1000) - 3600 })
    expect(old.status).toBe(400)
    const unknown = await callWebhook('jeton-inconnu-1234567890', { data: { reference: r.body.data.provider_reference } })
    expect(unknown.status).toBe(404)

    const [row] = await sql`SELECT status, applied_payment_id FROM mobile_money_payments WHERE id = ${r.body.data.id}`
    expect(row.status).toBe('pending')
    expect(await mmPaymentsFor(r.body.data.id)).toHaveLength(0)
  })

  it('webhook valide + vérification API → une seule imputation, même rejoué ou simultané', async () => {
    const t = await tenantWithCreditSale()
    const r = await createRequest({ creditNoteId: t.creditId, amount: 1500 })
    const ref = r.body.data.provider_reference
    const p = fake.get(ref)!
    p.status = 'completed'
    p.payment_method = 'wave'

    const payload = { event: 'payment.success', data: { reference: ref, amount: 1500, status: 'completed' } }
    const first = await callWebhook(t.token, payload)
    expect(first.status).toBe(200)
    // Rejeu + appels simultanés (webhook en double, cron, « Vérifier maintenant »)
    const again = await Promise.all([
      callWebhook(t.token, payload),
      callWebhook(t.token, payload),
      reconcileRequest(r.body.data.id, { companyId: t.companyId, source: 'manual' }),
    ])
    expect(again[0].status).toBe(200)

    const payments = await mmPaymentsFor(r.body.data.id)
    expect(payments).toHaveLength(1)
    expect(payments[0].payment_method).toBe('mobile_money')
    expect(payments[0].reference).toBe(ref)
    expect(Number(payments[0].amount)).toBe(1500)

    const [row] = await sql`SELECT status, applied_payment_id, provider_method FROM mobile_money_payments WHERE id = ${r.body.data.id}`
    expect(row.status).toBe('paid')
    expect(row.applied_payment_id).toBe(payments[0].id)
    expect(row.provider_method).toBe('wave')
    const [credit] = await sql`SELECT paid_amount, status FROM credit_notes WHERE id = ${t.creditId}`
    expect(Number(credit.paid_amount)).toBe(1500)
    expect(credit.status).toBe('partial')
    const [order] = await sql`SELECT paid_amount FROM sales_orders WHERE id = ${t.orderId}`
    expect(Number(order.paid_amount)).toBe(1500)
    const cp = await sql`SELECT 1 FROM credit_payments WHERE credit_note_id = ${t.creditId}`
    expect(cp).toHaveLength(1)
  })

  it('le contenu du webhook ne fait pas foi : API « en attente » → rien n’est imputé', async () => {
    const t = await tenantWithCreditSale()
    const r = await createRequest({ creditNoteId: t.creditId, amount: 2000 })
    // Le webhook (signé) prétend « payé », mais GeniusPay répond « pending »
    const res = await callWebhook(t.token, { data: { reference: r.body.data.provider_reference, status: 'completed', amount: 2000 } })
    expect(res.status).toBe(200)
    const [row] = await sql`SELECT status FROM mobile_money_payments WHERE id = ${r.body.data.id}`
    expect(row.status).toBe('pending')
    expect(await mmPaymentsFor(r.body.data.id)).toHaveLength(0)
  })

  it('paiement échoué : non imputé', async () => {
    const t = await tenantWithCreditSale()
    const r = await createRequest({ salesOrderId: t.orderId, amount: 2000 })
    fake.get(r.body.data.provider_reference)!.status = 'failed'
    const res = await callWebhook(t.token, { data: { reference: r.body.data.provider_reference } }, { event: 'payment.failed' })
    expect(res.status).toBe(200)
    const [row] = await sql`SELECT status, applied_payment_id FROM mobile_money_payments WHERE id = ${r.body.data.id}`
    expect(row.status).toBe('failed')
    expect(row.applied_payment_id).toBeNull()
    expect(await mmPaymentsFor(r.body.data.id)).toHaveLength(0)
    const [credit] = await sql`SELECT paid_amount FROM credit_notes WHERE id = ${t.creditId}`
    expect(Number(credit.paid_amount)).toBe(0)
  })

  it('montant payé inférieur au montant demandé : non imputé', async () => {
    const t = await tenantWithCreditSale()
    const r = await createRequest({ creditNoteId: t.creditId, amount: 2000 })
    const p = fake.get(r.body.data.provider_reference)!
    p.status = 'completed'
    p.amount = 500
    const outcome = await reconcileRequest(r.body.data.id, { companyId: t.companyId, source: 'manual' })
    expect(outcome.applied).toBe(false)
    expect(outcome.applyError).toMatch(/incohérents/)
    expect(await mmPaymentsFor(r.body.data.id)).toHaveLength(0)
  })

  it('dette soldée entre-temps : payé mais non imputé, à traiter manuellement', async () => {
    const t = await tenantWithCreditSale()
    const r = await createRequest({ creditNoteId: t.creditId, amount: 2000 })
    // Le client règle en espèces avant de payer le lien
    await sql`UPDATE credit_notes SET paid_amount = total_amount, status = 'paid' WHERE id = ${t.creditId}`
    fake.get(r.body.data.provider_reference)!.status = 'completed'
    const res = await json(await mmVerify.POST(req('POST'), params(r.body.data.id)))
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('paid')
    expect(res.body.data.applied_payment_id).toBeNull()
    expect(res.body.data.apply_error).toMatch(/non imputé/)
    expect(await mmPaymentsFor(r.body.data.id)).toHaveLength(0)
  })

  it('cron : rattrape un webhook perdu ; protégé par CRON_SECRET', async () => {
    const t = await tenantWithCreditSale()
    const r = await createRequest({ creditNoteId: t.creditId, amount: 2000 })
    fake.get(r.body.data.provider_reference)!.status = 'completed'
    const outcome = await reconcileRequest(r.body.data.id, { source: 'cron' })
    expect(outcome.applied).toBe(true)
    const [credit] = await sql`SELECT status FROM credit_notes WHERE id = ${t.creditId}`
    expect(credit.status).toBe('paid')

    const unauthorized = await cronRoute.GET(new NextRequest('http://localhost/api/cron/reconcile-mobile-money'))
    expect(unauthorized.status).toBe(401)
  })
})

describe('Partage du lien', () => {
  it('QR code et lien WhatsApp prérempli', async () => {
    const { qrSvgPath } = await import('@/lib/mobile-money/qr')
    const { paymentMessage, whatsappLink } = await import('@/lib/mobile-money/labels')
    const qr = qrSvgPath('https://pay.genius.ci/checkout/MTX-123')
    expect(qr.size).toBeGreaterThanOrEqual(21)
    expect(qr.path.length).toBeGreaterThan(100)

    const msg = paymentMessage({ clientName: 'Maquis Chez Tanti', companyName: 'Dépôt Yopougon', amount: 15000, url: 'https://x.test/p' })
    expect(msg).toContain('15')
    expect(msg).toContain('https://x.test/p')
    const link = whatsappLink('07 07 07 07 07', msg)
    expect(link.startsWith('https://wa.me/2250707070707?text=')).toBe(true)
    expect(decodeURIComponent(link.split('text=')[1])).toBe(msg)
    expect(whatsappLink(null, 'x')).toBe('https://wa.me/?text=x')
  })
})
