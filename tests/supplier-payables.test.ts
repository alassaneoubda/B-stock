import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { actAs, json, params, req } from './route-helpers'
import { sql } from '@/lib/db'
import { createProduct, createTenant } from './helpers'
import { generateAlertsForCompany } from '@/lib/domain/alerts'
import * as procurement from '@/app/api/procurement/route'
import * as payments from '@/app/api/procurement/[id]/payments/route'
import * as paymentCancel from '@/app/api/procurement/[id]/payments/[paymentId]/cancel/route'
import * as dueDate from '@/app/api/procurement/[id]/payments/due-date/route'
import * as payables from '@/app/api/suppliers/payables/route'
import * as statement from '@/app/api/suppliers/[id]/statement/route'
import * as priceHistory from '@/app/api/suppliers/[id]/price-history/route'
import * as suggestions from '@/app/api/procurement/suggestions/route'

type Tenant = Awaited<ReturnType<typeof createTenant>>

async function createSupplier(companyId: string, terms = 30, name = 'Solibra') {
  const [s] = await sql`
    INSERT INTO suppliers (company_id, name, payment_terms_days) VALUES (${companyId}, ${name}, ${terms}) RETURNING id
  `
  return s.id as string
}

/**
 * Bon de commande réceptionné il y a `daysAgo` jours (écrit directement en base :
 * ces tests portent sur les dettes, pas sur la logique de réception).
 */
async function makeReceivedOrder(
  t: Tenant,
  supplierId: string,
  variantId: string,
  opts: { qty: number; price: number; received?: number; daysAgo?: number }
) {
  const received = opts.received ?? opts.qty
  const daysAgo = opts.daysAgo ?? 0
  const complete = received >= opts.qty
  const [po] = await sql`
    INSERT INTO purchase_orders (
      company_id, supplier_id, depot_id, order_number, status, total_amount,
      ordered_at, received_at, created_by
    ) VALUES (
      ${t.companyId}, ${supplierId}, ${t.depotId}, ${`ACH-T${randomUUID().slice(0, 8)}`},
      ${complete ? 'received' : 'partial'}, ${opts.qty * opts.price},
      NOW() - make_interval(days => ${daysAgo + 1}::int),
      CASE WHEN ${complete}::boolean THEN NOW() - make_interval(days => ${daysAgo}::int) END,
      ${t.userId}
    ) RETURNING id, order_number
  `
  await sql`
    INSERT INTO purchase_order_items (purchase_order_id, product_variant_id, quantity_ordered, quantity_received, unit_price)
    VALUES (${po.id}, ${variantId}, ${opts.qty}, ${received}, ${opts.price})
  `
  if (received > 0) {
    await sql`
      INSERT INTO stock_movements (company_id, depot_id, product_variant_id, movement_type, quantity, reference_type, reference_id, created_by, created_at)
      VALUES (${t.companyId}, ${t.depotId}, ${variantId}, 'purchase', ${received}, 'purchase_order', ${po.id}, ${t.userId},
              NOW() - make_interval(days => ${daysAgo}::int))
    `
  }
  return { id: po.id as string, orderNumber: po.order_number as string }
}

async function openCash(t: Tenant) {
  await sql`
    INSERT INTO cash_sessions (company_id, depot_id, opened_by, opening_amount, status)
    VALUES (${t.companyId}, ${t.depotId}, ${t.userId}, 100000, 'open')
  `
}

async function payableOf(poId: string) {
  const res = await json(await payments.GET(req('GET'), params(poId)))
  expect(res.status).toBe(200)
  return res.body.data
}

const pay = (poId: string, body: Record<string, unknown>) => payments.POST(req('POST', body), params(poId))
const cancelParams = (id: string, paymentId: string) => ({ params: Promise.resolve({ id, paymentId }) })

function isoInDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function setup(terms = 30) {
  const t = await createTenant('Achats')
  const p = await createProduct(t.companyId, t.depotId)
  const supplierId = await createSupplier(t.companyId, terms)
  actAs(t)
  return { ...t, ...p, supplierId }
}

describe('Dettes fournisseurs : règlements', () => {
  it('paiement partiel puis total : reste à payer, statut, numérotation', async () => {
    const t = await setup(30)
    const po = await makeReceivedOrder(t, t.supplierId, t.variantId, { qty: 10, price: 1000 })

    let data = await payableOf(po.id)
    expect(data.payable.amount_due).toBe(10000)
    expect(data.payable.payment_status).toBe('unpaid')
    expect(data.payable.due_date).toBe(isoInDays(30))

    const first = await json(await pay(po.id, { amount: 4000, method: 'bank_transfer', reference: 'VIR-1' }))
    expect(first.status).toBe(201)
    expect(first.body.data.payment_number).toBe('RF-000001')
    expect(first.body.data.remaining).toBe(6000)

    data = await payableOf(po.id)
    expect(data.payable.paid_amount).toBe(4000)
    expect(data.payable.remaining).toBe(6000)
    expect(data.payable.payment_status).toBe('partial')

    const over = await json(await pay(po.id, { amount: 7000, method: 'check' }))
    expect(over.status).toBe(409)
    expect(over.body.code).toBe('OVERPAYMENT')

    const second = await json(await pay(po.id, { amount: 6000, method: 'mobile_money' }))
    expect(second.status).toBe(201)
    expect(second.body.data.payment_number).toBe('RF-000002')

    data = await payableOf(po.id)
    expect(data.payable.remaining).toBe(0)
    expect(data.payable.payment_status).toBe('paid')
    expect(data.payments).toHaveLength(2)

    const extra = await json(await pay(po.id, { amount: 1, method: 'cash' }))
    expect(extra.status).toBe(409)
    expect(extra.body.code).toBe('NOTHING_TO_PAY')
  })

  it('bon non réceptionné : rien à payer ; bon d’une autre entreprise : introuvable', async () => {
    const t = await setup()
    const po = await makeReceivedOrder(t, t.supplierId, t.variantId, { qty: 10, price: 1000, received: 0 })
    const res = await json(await pay(po.id, { amount: 1000, method: 'cash' }))
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('NOTHING_TO_PAY')

    const received = await makeReceivedOrder(t, t.supplierId, t.variantId, { qty: 2, price: 500 })
    const other = await createTenant('Autre')
    actAs(other)
    expect((await pay(received.id, { amount: 100, method: 'cash' })).status).toBe(404)
    expect((await payments.GET(req('GET'), params(received.id))).status).toBe(404)
  })

  it('réception partielle : la dette porte sur les quantités reçues, moins les retours', async () => {
    const t = await setup()
    const po = await makeReceivedOrder(t, t.supplierId, t.variantId, { qty: 10, price: 1000, received: 6 })
    await sql`
      INSERT INTO stock_movements (company_id, depot_id, product_variant_id, movement_type, quantity, reference_type, reference_id, created_by)
      VALUES (${t.companyId}, ${t.depotId}, ${t.variantId}, 'return', -2, 'purchase_order', ${po.id}, ${t.userId})
    `
    const data = await payableOf(po.id)
    expect(data.payable.ordered_value).toBe(10000)
    expect(data.payable.received_value).toBe(6000)
    expect(data.payable.returned_value).toBe(2000)
    expect(data.payable.amount_due).toBe(4000)
  })

  it('statut en retard, échéance saisie à la main, alerte fournisseur', async () => {
    const t = await setup(30)
    const po = await makeReceivedOrder(t, t.supplierId, t.variantId, { qty: 10, price: 1000, daysAgo: 40 })

    let data = await payableOf(po.id)
    expect(data.payable.payment_status).toBe('overdue')
    expect(data.payable.days_overdue).toBe(10)

    const board = await json(await payables.GET(req('GET', undefined, 'http://localhost/api/suppliers/payables?status=overdue')))
    expect(board.status).toBe(200)
    expect(board.body.data.summary.overdue).toBe(10000)
    expect(board.body.data.summary.overdueCount).toBe(1)
    expect(board.body.data.rows.map((r: any) => r.purchase_order_id)).toEqual([po.id])
    expect(board.body.data.suppliers[0]).toMatchObject({ supplier_id: t.supplierId, remaining: 10000, overdue: 10000 })

    await generateAlertsForCompany(t.companyId)
    let [alert] = await sql`
      SELECT * FROM alerts WHERE company_id = ${t.companyId} AND alert_type = 'supplier_overdue' AND reference_id = ${po.id}
    `
    expect(alert.is_resolved).toBe(false)
    expect(alert.reference_type).toBe('purchase_order')

    // Échéance repoussée (facture fournisseur reçue plus tard) : à échoir sous 7 jours
    const res = await json(await dueDate.PUT(req('PUT', { dueDate: isoInDays(3) }), params(po.id)))
    expect(res.status).toBe(200)
    data = await payableOf(po.id)
    expect(data.payable.payment_status).toBe('unpaid')
    expect(data.payable.due_soon).toBe(true)
    const soon = await json(await payables.GET(req('GET', undefined, 'http://localhost/api/suppliers/payables?status=due_soon')))
    expect(soon.body.data.summary.dueSoon).toBe(10000)
    expect(soon.body.data.rows).toHaveLength(1)

    await generateAlertsForCompany(t.companyId)
    ;[alert] = await sql`SELECT is_resolved FROM alerts WHERE id = ${alert.id}`
    expect(alert.is_resolved).toBe(true)

    // Retour à l'échéance calculée
    await dueDate.PUT(req('PUT', { dueDate: null }), params(po.id))
    data = await payableOf(po.id)
    expect(data.payable.payment_status).toBe('overdue')
  })
})

describe('Dettes fournisseurs : caisse et annulation', () => {
  it('paiement en espèces avec caisse ouverte : sortie de caisse automatique', async () => {
    const t = await setup()
    await openCash(t)
    const po = await makeReceivedOrder(t, t.supplierId, t.variantId, { qty: 5, price: 1000 })

    const res = await json(await pay(po.id, { amount: 3000, method: 'cash' }))
    expect(res.status).toBe(201)
    expect(res.body.warnings).toEqual([])
    const [movement] = await sql`
      SELECT * FROM cash_movements WHERE reference_type = 'supplier_payment' AND reference_id = ${res.body.data.id}
    `
    expect(movement.movement_type).toBe('cash_out')
    expect(movement.category).toBe('supplier_payment')
    expect(Number(movement.amount)).toBe(3000)
    expect(res.body.data.cash_movement_id).toBe(movement.id)

    // Virement : aucune écriture de caisse
    const transfer = await json(await pay(po.id, { amount: 1000, method: 'bank_transfer' }))
    const none = await sql`SELECT 1 FROM cash_movements WHERE reference_id = ${transfer.body.data.id}`
    expect(none).toHaveLength(0)
  })

  it('paiement en espèces sans caisse ouverte : enregistré avec un avertissement', async () => {
    const t = await setup()
    const po = await makeReceivedOrder(t, t.supplierId, t.variantId, { qty: 5, price: 1000 })
    const res = await json(await pay(po.id, { amount: 2000, method: 'cash' }))
    expect(res.status).toBe(201)
    expect(res.body.warnings).toHaveLength(1)
    const rows = await sql`SELECT 1 FROM cash_movements WHERE company_id = ${t.companyId}`
    expect(rows).toHaveLength(0)
  })

  it('annulation : reste à payer rétabli, contre-passation en caisse, pas de double annulation', async () => {
    const t = await setup()
    await openCash(t)
    const po = await makeReceivedOrder(t, t.supplierId, t.variantId, { qty: 5, price: 1000 })
    const paid = await json(await pay(po.id, { amount: 5000, method: 'cash' }))
    expect((await payableOf(po.id)).payable.payment_status).toBe('paid')

    const res = await json(
      await paymentCancel.POST(req('POST', { reason: 'Erreur de saisie' }), cancelParams(po.id, paid.body.data.id))
    )
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('cancelled')

    const data = await payableOf(po.id)
    expect(data.payable.paid_amount).toBe(0)
    expect(data.payable.remaining).toBe(5000)
    expect(data.payable.payment_status).toBe('unpaid')

    const movements = await sql`
      SELECT movement_type, category, amount::float8 AS amount FROM cash_movements
      WHERE reference_type = 'supplier_payment' AND reference_id = ${paid.body.data.id}
      ORDER BY created_at, movement_type DESC
    `
    expect(movements).toEqual([
      { movement_type: 'cash_out', category: 'supplier_payment', amount: 5000 },
      { movement_type: 'cash_in', category: 'supplier_payment_cancel', amount: 5000 },
    ])

    const again = await paymentCancel.POST(req('POST', {}), cancelParams(po.id, paid.body.data.id))
    expect(again.status).toBe(409)

    // Le bon peut de nouveau être réglé
    expect((await pay(po.id, { amount: 5000, method: 'bank_transfer' })).status).toBe(201)
  })
})

describe('Fiche fournisseur', () => {
  it('solde dû, relevé chronologique (achats, retours, règlements, annulation) et échéances', async () => {
    const t = await setup(30)
    const old = await makeReceivedOrder(t, t.supplierId, t.variantId, { qty: 10, price: 1000, daysAgo: 45 })
    const recent = await makeReceivedOrder(t, t.supplierId, t.variantId, { qty: 4, price: 1100, daysAgo: 2 })
    await sql`
      INSERT INTO stock_movements (company_id, depot_id, product_variant_id, movement_type, quantity, reference_type, reference_id, created_by)
      VALUES (${t.companyId}, ${t.depotId}, ${t.variantId}, 'return', -1, 'purchase_order', ${recent.id}, ${t.userId})
    `
    await pay(old.id, { amount: 4000, method: 'bank_transfer' })
    const cancelled = await json(await pay(old.id, { amount: 1000, method: 'check' }))
    await paymentCancel.POST(req('POST', {}), cancelParams(old.id, cancelled.body.data.id))
    // Fournisseur d'une autre entreprise : jamais mélangé
    const other = await setup()
    await makeReceivedOrder(other, other.supplierId, other.variantId, { qty: 1, price: 999 })
    actAs(t)

    const res = await json(await statement.GET(req('GET'), params(t.supplierId)))
    expect(res.status).toBe(200)
    const s = res.body.data
    // 10 000 + 4 400 − 1 100 (retour) − 4 000 (règlement) = 9 300
    expect(s.balance).toBe(9300)
    expect(s.entries.map((e: any) => e.type)).toEqual(['purchase', 'purchase', 'return', 'payment', 'payment', 'payment_cancelled'])
    expect(s.entries[s.entries.length - 1].balance).toBe(9300)
    expect(s.overdue.map((p: any) => p.purchase_order_id)).toEqual([old.id])
    expect(s.upcoming.map((p: any) => p.purchase_order_id)).toEqual([recent.id])
    expect(s.summary.totalDue).toBe(9300)

    // Période : les écritures antérieures forment le solde d'ouverture
    const ranged = await json(
      await statement.GET(req('GET', undefined, `http://localhost/x?from=${isoInDays(-5)}`), params(t.supplierId))
    )
    expect(ranged.body.data.openingBalance).toBe(10000)
    expect(ranged.body.data.entries.map((e: any) => e.type)).toEqual(['purchase', 'return', 'payment', 'payment', 'payment_cancelled'])
    expect(ranged.body.data.closingBalance).toBe(9300)

    const history = await json(await priceHistory.GET(req('GET'), params(t.supplierId)))
    expect(history.status).toBe(200)
    expect(history.body.data).toHaveLength(1)
    expect(history.body.data[0]).toMatchObject({ last_price: 1100, min_price: 1000, max_price: 1100, purchases: 2, last_change_pct: 10 })

    actAs(other)
    expect((await statement.GET(req('GET'), params(t.supplierId))).status).toBe(404)
  })
})

describe('Suggestions de commande', () => {
  async function sale(t: Tenant, variantId: string, qty: number, daysAgo: number) {
    await sql`
      INSERT INTO stock_movements (company_id, depot_id, product_variant_id, movement_type, quantity, reference_type, created_by, created_at)
      VALUES (${t.companyId}, ${t.depotId}, ${variantId}, 'sale', ${-qty}, 'sales_order', ${t.userId},
              NOW() - make_interval(days => ${daysAgo}::int))
    `
  }

  it('ventes moyennes 28 jours, couverture, quantité suggérée, déjà en commande, fournisseur proposé', async () => {
    const t = await createTenant('Suggestions')
    const fast = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 10 }] })
    const idle = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 50 }] })
    const supplierId = await createSupplier(t.companyId, 0, 'Brassivoire')
    actAs(t)
    // 56 unités sur 28 jours = 2 / jour ; une vente plus ancienne est ignorée
    await sale(t, fast.variantId, 30, 3)
    await sale(t, fast.variantId, 26, 20)
    await sale(t, fast.variantId, 100, 40)
    await makeReceivedOrder(t, supplierId, fast.variantId, { qty: 1, price: 800, daysAgo: 60 })
    // La réception ci-dessus n'a pas touché la table stock : stock = 10

    const url = (qs: string) => `http://localhost/api/procurement/suggestions${qs}`
    let res = await json(await suggestions.GET(req('GET', undefined, url(''))))
    expect(res.status).toBe(200)
    expect(res.body.data.coverageDays).toBe(14)
    expect(res.body.data.rows).toHaveLength(1)
    expect(res.body.data.rows[0]).toMatchObject({
      product_variant_id: fast.variantId,
      sold_qty: 56,
      avg_daily_sales: 2,
      stock: 10,
      on_order: 0,
      coverage_days: 5,
      suggested_qty: 18,
      supplier_id: supplierId,
      unit_price: 800,
    })

    res = await json(await suggestions.GET(req('GET', undefined, url('?days=7'))))
    expect(res.body.data.rows[0].suggested_qty).toBe(4)

    // Une commande en attente de 5 unités est déduite
    await makeReceivedOrder(t, supplierId, fast.variantId, { qty: 5, price: 800, received: 0 })
    await sql`UPDATE purchase_orders SET status = 'pending' WHERE company_id = ${t.companyId} AND status = 'partial'`
    res = await json(await suggestions.GET(req('GET', undefined, url(''))))
    expect(res.body.data.rows[0]).toMatchObject({ on_order: 5, suggested_qty: 13 })

    // all=1 : aussi les produits sans besoin
    res = await json(await suggestions.GET(req('GET', undefined, url('?all=1'))))
    const idleRow = res.body.data.rows.find((r: any) => r.product_variant_id === idle.variantId)
    expect(idleRow).toMatchObject({ suggested_qty: 0, avg_daily_sales: 0, coverage_days: null, stock: 50 })

    // Paramètre hors bornes refusé ; dépôt d'une autre entreprise refusé
    expect((await suggestions.GET(req('GET', undefined, url('?days=0')))).status).toBe(400)
    const other = await createTenant('Autre')
    expect((await suggestions.GET(req('GET', undefined, url(`?depotId=${other.depotId}`)))).status).toBe(404)
  })

  it('le bon pré-rempli se crée via la création existante de bon de commande', async () => {
    const t = await setup()
    const res = await json(
      await procurement.POST(
        req('POST', {
          supplierId: t.supplierId,
          depotId: t.depotId,
          notes: 'Commande générée depuis « À commander »',
          items: [{ productVariantId: t.variantId, quantityOrdered: 18, unitPrice: 800 }],
        })
      )
    )
    expect(res.status).toBe(201)
    const [po] = await sql`SELECT status, total_amount::float8 AS total FROM purchase_orders WHERE id = ${res.body.data.id}`
    expect(po).toEqual({ status: 'pending', total: 14400 })
  })
})
