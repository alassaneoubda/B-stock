import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { actAs, json, req } from './route-helpers'
import { sql } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { createSale } from '@/lib/domain/sales'
import { addPosItems, openPosOrder, type PosActor } from '@/lib/domain/pos'
import { recordOfflinePosSale } from '@/lib/offline/pos-sync'
import { normalizeSoldAt } from '@/lib/offline/idempotency'
import {
  classifyResponse,
  correctSaleLines,
  discardSale,
  enqueue,
  localAvailable,
  markAttemptFailed,
  markRejected,
  markSent,
  newRequestId,
  nextPending,
  ownerKey,
  pendingQuantities,
  pendingSales,
  rejectedSales,
  retrySale,
  type OfflineSale,
  type SalePayload,
} from '@/lib/offline/queue'
import { createProduct, createTenant, stockOf } from './helpers'
import { POST as postSale } from '@/app/api/sales/route'

// vi.mock est remonté avant les imports : la route ne charge jamais le vrai NextAuth
vi.mock('@/lib/auth', () => ({ auth: async () => null }))

async function expectAppError(promise: Promise<unknown>, status: number, code?: string) {
  try {
    await promise
  } catch (e) {
    expect(e).toBeInstanceOf(AppError)
    expect((e as AppError).status).toBe(status)
    if (code) expect((e as AppError).code).toBe(code)
    return e as AppError
  }
  throw new Error(`AppError ${status} attendue`)
}

// ---------------------------------------------------------------------------
// File locale (fonctions pures)
// ---------------------------------------------------------------------------

function sale(id: string, createdAt: string, extra: Partial<OfflineSale> = {}): OfflineSale {
  return {
    id,
    owner: 'c1:u1',
    kind: 'pos',
    createdAt,
    status: 'pending',
    attempts: 0,
    summary: {
      label: 'Comptoir',
      depotId: 'd1',
      paymentMethod: 'cash',
      total: 1500,
      lines: [
        { variantId: 'v1', name: 'Bière', quantity: 2, unitPrice: 500 },
        { variantId: 'v2', name: 'Sucrerie', quantity: 1, unitPrice: 500 },
      ],
    },
    payload: {
      clientRequestId: id,
      depotId: 'd1',
      paymentMethod: 'cash',
      soldAt: createdAt,
      items: [
        { variantId: 'v1', quantity: 2, unitPrice: 500 },
        { variantId: 'v2', quantity: 1, unitPrice: 500 },
      ],
    },
    ...extra,
  }
}

describe('File des ventes hors ligne — fonctions pures', () => {
  it('ordre chronologique, une vente à la fois, filtrée par compte', () => {
    let q: OfflineSale[] = []
    q = enqueue(q, sale('b', '2026-10-07T10:02:00Z'))
    q = enqueue(q, sale('a', '2026-10-07T10:01:00Z'))
    q = enqueue(q, sale('z', '2026-10-07T10:00:00Z', { owner: 'c2:u9' }))
    expect(nextPending(q, 'c1:u1')?.id).toBe('a')
    expect(pendingSales(q, 'c1:u1').map((s) => s.id)).toEqual(['a', 'b'])
    // Une vente d'un autre compte n'est jamais proposée
    expect(nextPending(q, 'c2:u9')?.id).toBe('z')
    q = markSent(q, 'a')
    expect(nextPending(q, 'c1:u1')?.id).toBe('b')
    // Même clé réinsérée : remplacée, pas dupliquée
    q = enqueue(q, sale('b', '2026-10-07T10:02:00Z'))
    expect(q.filter((s) => s.id === 'b')).toHaveLength(1)
  })

  it('refus : statut « à vérifier » avec motif, puis réessai ou abandon', () => {
    let q = [sale('a', '2026-10-07T10:00:00Z'), sale('b', '2026-10-07T10:01:00Z')]
    q = markRejected(q, 'a', { code: 'INSUFFICIENT_STOCK', message: 'Bière : rupture de stock', status: 409 })
    expect(rejectedSales(q, 'c1:u1')).toHaveLength(1)
    expect(rejectedSales(q, 'c1:u1')[0].rejection).toMatchObject({ code: 'INSUFFICIENT_STOCK', message: 'Bière : rupture de stock' })
    // La vente refusée ne bloque pas la suivante
    expect(nextPending(q, 'c1:u1')?.id).toBe('b')
    q = retrySale(q, 'a')
    expect(q.find((s) => s.id === 'a')).toMatchObject({ status: 'pending', rejection: undefined })
    expect(nextPending(q, 'c1:u1')?.id).toBe('a')
    q = discardSale(q, 'a')
    expect(q.map((s) => s.id)).toEqual(['b'])
  })

  it('échec passager : reste en attente, erreurs serveur comptées', () => {
    let q = [sale('a', '2026-10-07T10:00:00Z')]
    q = markAttemptFailed(q, 'a', 'Réseau indisponible')
    q = markAttemptFailed(q, 'a', 'Erreur 500', { serverError: true })
    q = markAttemptFailed(q, 'a', 'Erreur 503', { serverError: true })
    expect(q[0]).toMatchObject({ status: 'pending', attempts: 3, serverErrors: 2, lastError: 'Erreur 503' })
    q = markAttemptFailed(q, 'a', 'Réseau indisponible')
    expect(q[0].serverErrors).toBe(0)
  })

  it('classement des réponses du serveur', () => {
    expect(classifyResponse(201).type).toBe('sent')
    expect(classifyResponse(200).type).toBe('sent')
    expect(classifyResponse(0).type).toBe('retry')
    expect(classifyResponse(503).type).toBe('retry')
    expect(classifyResponse(429).type).toBe('retry')
    expect(classifyResponse(401).type).toBe('stop')
    expect(classifyResponse(402).type).toBe('stop')
    expect(classifyResponse(409, { error: 'Bière : rupture de stock', code: 'INSUFFICIENT_STOCK' })).toEqual({
      type: 'reject',
      code: 'INSUFFICIENT_STOCK',
      message: 'Bière : rupture de stock',
      status: 409,
    })
    expect(classifyResponse(400, { error: 'Mois clôturé', code: 'PERIOD_CLOSED' }).type).toBe('reject')
  })

  it('stock local : stock connu − ventes en attente − panier, jamais négatif', () => {
    const q = [sale('a', '2026-10-07T10:00:00Z'), sale('b', '2026-10-07T10:01:00Z', { status: 'rejected' })]
    const pending = pendingQuantities(q, 'c1:u1', 'd1')
    expect(pending.get('v1')).toBe(2) // la vente refusée n'est pas comptée
    expect(pendingQuantities(q, 'c1:u1', 'autre-depot').size).toBe(0)
    expect(localAvailable(10, 2, 3)).toBe(5)
    expect(localAvailable(1, 2, 0)).toBe(0)
  })

  it('correction des quantités : total et corps recalculés (POS et Nouvelle vente)', () => {
    const pos = correctSaleLines(sale('a', '2026-10-07T10:00:00Z'), { v1: 1, v2: 0 })
    expect(pos.summary.total).toBe(500)
    expect(pos.summary.lines).toHaveLength(1)
    expect((pos.payload as { items: unknown[] }).items).toEqual([{ variantId: 'v1', quantity: 1, unitPrice: 500 }])

    const payload: SalePayload = {
      clientRequestId: 'x',
      offlineSoldAt: '2026-10-07T10:00:00Z',
      clientId: 'c',
      depotId: 'd1',
      paymentMethod: 'cash',
      paidAmount: 2500,
      items: [{ productVariantId: 'v1', quantity: 2, unitPrice: 500 }],
      packagingItems: [{ packagingTypeId: 'p', quantityOut: 1, quantityIn: 0, unitPrice: 1500 }],
    }
    const s = correctSaleLines({ ...sale('x', '2026-10-07T10:00:00Z'), kind: 'sale', payload }, { v1: 1, v2: 0 })
    expect(s.summary.total).toBe(2000) // 500 + consigne 1500
    expect((s.payload as SalePayload).paidAmount).toBe(2000)
    expect((s.payload as SalePayload).items).toEqual([{ productVariantId: 'v1', quantity: 1, unitPrice: 500 }])
  })

  it('clé UUID v4 et compte propriétaire', () => {
    expect(newRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(ownerKey({ companyId: 'c', id: 'u' })).toBe('c:u')
    expect(ownerKey(null)).toBeNull()
  })

  it('heure de vente de l’appareil bornée (pas de futur, 60 jours max)', () => {
    const now = Date.parse('2026-10-07T12:00:00Z')
    expect(normalizeSoldAt('2026-10-07T11:00:00Z', now)).toBe('2026-10-07T11:00:00.000Z')
    expect(normalizeSoldAt('2030-01-01T00:00:00Z', now)).toBe('2026-10-07T12:00:00.000Z')
    expect(normalizeSoldAt('2020-01-01T00:00:00Z', now)).toBe(new Date(now - 60 * 86_400_000).toISOString())
    expect(normalizeSoldAt('n’importe quoi', now)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Idempotence côté serveur
// ---------------------------------------------------------------------------

describe('Idempotence — Nouvelle vente', () => {
  it('même clé deux fois → une seule vente, même réponse, stock décrémenté une fois', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 10 }] })
    const key = randomUUID()
    const input = {
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'cash' as const, paidAmount: 1000, clientRequestId: key, offlineSoldAt: new Date().toISOString(),
      items: [{ productVariantId: p.variantId, quantity: 2, unitPrice: 500 }],
    }
    const first = await createSale(input)
    const second = await createSale(input)
    expect(first.replayed).toBeFalsy()
    expect(second.replayed).toBe(true)
    expect(second.order.id).toBe(first.order.id)
    expect(second.order.order_number).toBe(first.order.order_number)
    expect(await stockOf(t.depotId, p.variantId)).toBe(8)
    const orders = await sql`SELECT client_request_id, offline_sold_at FROM sales_orders WHERE company_id = ${t.companyId}`
    expect(orders).toHaveLength(1)
    expect(orders[0].client_request_id).toBe(key)
    expect(orders[0].offline_sold_at).not.toBeNull()
  })

  it('envois simultanés de la même clé → une seule vente', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 10 }] })
    const key = randomUUID()
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        createSale({
          companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
          paymentMethod: 'cash', paidAmount: 500, clientRequestId: key,
          items: [{ productVariantId: p.variantId, quantity: 1, unitPrice: 500 }],
        })
      )
    )
    expect(new Set(results.map((r) => r.order.id)).size).toBe(1)
    expect(results.filter((r) => !r.replayed)).toHaveLength(1)
    expect(await stockOf(t.depotId, p.variantId)).toBe(9)
  })

  it('même clé dans une autre entreprise → ventes indépendantes', async () => {
    const a = await createTenant('A')
    const b = await createTenant('B')
    const pa = await createProduct(a.companyId, a.depotId, { lots: [{ lot: null, qty: 5 }] })
    const pb = await createProduct(b.companyId, b.depotId, { lots: [{ lot: null, qty: 5 }] })
    const key = randomUUID()
    const base = { paymentMethod: 'cash' as const, paidAmount: 500, clientRequestId: key }
    const sa = await createSale({ ...base, companyId: a.companyId, userId: a.userId, clientId: a.clientId, depotId: a.depotId, items: [{ productVariantId: pa.variantId, quantity: 1, unitPrice: 500 }] })
    const sb = await createSale({ ...base, companyId: b.companyId, userId: b.userId, clientId: b.clientId, depotId: b.depotId, items: [{ productVariantId: pb.variantId, quantity: 1, unitPrice: 500 }] })
    expect(sb.replayed).toBeFalsy()
    expect(sb.order.id).not.toBe(sa.order.id)
    expect(await stockOf(b.depotId, pb.variantId)).toBe(4)
  })

  it('vente refusée (stock insuffisant) : rien d’écrit, la clé reste utilisable après correction', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 1 }] })
    const key = randomUUID()
    const base = { companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId, paymentMethod: 'cash' as const, clientRequestId: key }
    await expectAppError(createSale({ ...base, paidAmount: 1000, items: [{ productVariantId: p.variantId, quantity: 2, unitPrice: 500 }] }), 409, 'INSUFFICIENT_STOCK')
    const fixed = await createSale({ ...base, paidAmount: 500, items: [{ productVariantId: p.variantId, quantity: 1, unitPrice: 500 }] })
    expect(fixed.replayed).toBeFalsy()
    expect(await stockOf(t.depotId, p.variantId)).toBe(0)
  })

  it('POST /api/sales : 201 puis 200 avec la même vente', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 10 }] })
    actAs(t)
    const body = {
      clientRequestId: randomUUID(),
      offlineSoldAt: new Date().toISOString(),
      clientId: t.clientId, depotId: t.depotId, paymentMethod: 'cash', paidAmount: 500,
      items: [{ productVariantId: p.variantId, quantity: 1, unitPrice: 500 }],
    }
    const first = await json(await postSale(req('POST', body)))
    const second = await json(await postSale(req('POST', body)))
    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(second.body.replayed).toBe(true)
    expect(second.body.data.id).toBe(first.body.data.id)
    expect(await stockOf(t.depotId, p.variantId)).toBe(9)
  })
})

describe('Idempotence — point de vente hors ligne', () => {
  async function setup(stock = 10) {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, { price: 700, lots: [{ lot: null, qty: stock }] })
    const actor: PosActor = { companyId: t.companyId, userId: t.userId, canManage: true }
    return { ...t, ...p, actor }
  }

  it('vente comptoir hors ligne : ticket + vente créés une fois, renvoi idempotent', async () => {
    const t = await setup()
    const input = {
      clientRequestId: randomUUID(), depotId: t.depotId, paymentMethod: 'cash' as const, label: 'Table du fond',
      soldAt: new Date().toISOString(), items: [{ variantId: t.variantId, quantity: 3, unitPrice: 700 }],
    }
    const first = await recordOfflinePosSale(t.actor, input)
    const again = await recordOfflinePosSale(t.actor, input)
    expect(first.replayed).toBe(false)
    expect(again).toMatchObject({ replayed: true, saleId: first.saleId, orderNumber: first.orderNumber, ticketNumber: first.ticketNumber })
    expect(await stockOf(t.depotId, t.variantId)).toBe(7)
    const [ticket] = await sql`SELECT status, label, sales_order_id FROM pos_orders WHERE company_id = ${t.companyId}`
    expect(ticket).toMatchObject({ status: 'paid', label: 'Table du fond', sales_order_id: first.saleId })
    const [order] = await sql`SELECT status, order_source, total_amount FROM sales_orders WHERE id = ${first.saleId}`
    expect(order).toMatchObject({ status: 'delivered', order_source: 'pos' })
    expect(Number(order.total_amount)).toBe(2100)
  })

  it('prix modifié depuis la coupure → refus PRICE_CHANGED, accepté sur demande', async () => {
    const t = await setup()
    const base = { depotId: t.depotId, paymentMethod: 'cash' as const, items: [{ variantId: t.variantId, quantity: 1, unitPrice: 600 }] }
    const key = randomUUID()
    await expectAppError(recordOfflinePosSale(t.actor, { ...base, clientRequestId: key }), 409, 'PRICE_CHANGED')
    expect(await stockOf(t.depotId, t.variantId)).toBe(10)
    const ok = await recordOfflinePosSale(t.actor, { ...base, clientRequestId: key, acceptCurrentPrices: true })
    expect(ok.warnings.join(' ')).toContain('prix actuels')
    const [order] = await sql`SELECT total_amount FROM sales_orders WHERE id = ${ok.saleId}`
    expect(Number(order.total_amount)).toBe(700)
  })

  it('stock insuffisant à la synchronisation → refus sans écriture', async () => {
    const t = await setup(1)
    await expectAppError(
      recordOfflinePosSale(t.actor, { clientRequestId: randomUUID(), depotId: t.depotId, paymentMethod: 'cash', items: [{ variantId: t.variantId, quantity: 2, unitPrice: 700 }] }),
      409,
      'INSUFFICIENT_STOCK'
    )
    const tickets = await sql`SELECT 1 FROM pos_orders WHERE company_id = ${t.companyId}`
    expect(tickets).toHaveLength(0)
  })

  it('ticket ouvert encaissé hors ligne : clos si inchangé, refusé s’il a changé ou est déjà clos', async () => {
    const t = await setup()
    const { id } = await openPosOrder(t.actor, { depotId: t.depotId, orderType: 'counter' })
    await addPosItems(t.actor, id, [{ variantId: t.variantId, quantity: 2 }])
    const snapshot = { depotId: t.depotId, posOrderId: id, paymentMethod: 'mobile_money' as const, items: [{ variantId: t.variantId, quantity: 2, unitPrice: 700 }] }

    // Ticket modifié ailleurs pendant la coupure
    await expectAppError(
      recordOfflinePosSale(t.actor, { ...snapshot, clientRequestId: randomUUID(), items: [{ variantId: t.variantId, quantity: 1, unitPrice: 700 }] }),
      409,
      'TICKET_CHANGED'
    )

    const key = randomUUID()
    const paid = await recordOfflinePosSale(t.actor, { ...snapshot, clientRequestId: key })
    expect(paid.replayed).toBe(false)
    expect((await recordOfflinePosSale(t.actor, { ...snapshot, clientRequestId: key })).saleId).toBe(paid.saleId)
    const [ticket] = await sql`SELECT status, sales_order_id FROM pos_orders WHERE id = ${id}`
    expect(ticket).toMatchObject({ status: 'paid', sales_order_id: paid.saleId })
    expect(await stockOf(t.depotId, t.variantId)).toBe(8)

    // Autre appareil qui l'encaisse aussi hors ligne (autre clé) → refusé
    await expectAppError(recordOfflinePosSale(t.actor, { ...snapshot, clientRequestId: randomUUID() }), 409, 'ORDER_CLOSED')
  })
})
