import { describe, expect, it } from 'vitest'
import { actAs, json, params, req } from './route-helpers'
import { sql } from '@/lib/db'
import { changeSaleStatus, createSale } from '@/lib/domain/sales'
import { addPosItems, openPosOrder, payPosOrder } from '@/lib/domain/pos'
import { todayIso } from '@/lib/domain/costing'
import { createProduct, createTenant, stockOf } from './helpers'
import * as procurement from '@/app/api/procurement/route'
import * as transfers from '@/app/api/transfers/route'
import * as transferReceive from '@/app/api/transfers/[id]/receive/route'
import * as saleReturn from '@/app/api/sales/[id]/return/route'
import * as returns from '@/app/api/returns/route'
import * as returnProcess from '@/app/api/returns/[id]/process/route'
import * as marginReport from '@/app/api/reports/margin/route'
import * as stockValue from '@/app/api/reports/stock-value/route'

type Tenant = Awaited<ReturnType<typeof createTenant>>

async function supplierOf(companyId: string) {
  const [s] = await sql`INSERT INTO suppliers (company_id, name) VALUES (${companyId}, 'Solibra') RETURNING id`
  return s.id as string
}

/** Commande fournisseur + réception complète au prix donné (passe par la route). */
async function receive(t: Tenant, supplierId: string, variantId: string, quantity: number, unitPrice: number, depotId = t.depotId) {
  const created = await json(await procurement.POST(req('POST', {
    supplierId, depotId, items: [{ productVariantId: variantId, quantityOrdered: quantity, unitPrice }],
  })))
  expect(created.status).toBe(201)
  const [item] = await sql`SELECT id FROM purchase_order_items WHERE purchase_order_id = ${created.body.data.id}`
  const res = await json(await procurement.POST(req('POST', {
    purchaseOrderId: created.body.data.id, items: [{ itemId: item.id, quantityReceived: quantity }],
  })))
  expect(res.status).toBeLessThan(300)
  return created.body.data.id as string
}

async function cmp(depotId: string, variantId: string): Promise<number> {
  const [row] = await sql`
    SELECT avg_cost::float AS c FROM stock_costs WHERE depot_id = ${depotId} AND product_variant_id = ${variantId}
  `
  return row?.c
}

/** Valeur du couple (dépôt, variante) selon le journal des mouvements valorisés. */
async function journalValue(depotId: string, variantId: string): Promise<number> {
  const [row] = await sql`
    SELECT COALESCE(SUM(quantity * unit_cost), 0)::float AS v FROM stock_movements
    WHERE depot_id = ${depotId} AND product_variant_id = ${variantId}
  `
  return row.v
}

async function sell(t: Tenant, variantId: string, quantity: number, unitPrice: number, extra: { agentId?: string } = {}) {
  const { order } = await createSale({
    companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
    paymentMethod: 'cash', paidAmount: quantity * unitPrice,
    items: [{ productVariantId: variantId, quantity, unitPrice }],
    ...extra,
  })
  return order.id as string
}

describe('Coût moyen pondéré (CMP)', () => {
  it('deux réceptions à prix différents : CMP pondéré, coût figé sur chaque mouvement', async () => {
    const t = await createTenant()
    actAs(t)
    const p = await createProduct(t.companyId, t.depotId)
    const supplierId = await supplierOf(t.companyId)

    await receive(t, supplierId, p.variantId, 10, 300)
    expect(await cmp(t.depotId, p.variantId)).toBe(300)
    await receive(t, supplierId, p.variantId, 30, 400)
    // (10 × 300 + 30 × 400) / 40 = 375
    expect(await cmp(t.depotId, p.variantId)).toBe(375)

    const moves = await sql`
      SELECT quantity, unit_cost::float AS c FROM stock_movements
      WHERE product_variant_id = ${p.variantId} ORDER BY created_at, quantity
    `
    expect(moves.map((m) => [m.quantity, m.c])).toEqual([[10, 300], [30, 400]])
    expect(await journalValue(t.depotId, p.variantId)).toBe(40 * 375)
  })
})

describe('Coût de revient des ventes', () => {
  it('la vente fige le coût ; l’annulation remet le stock au même coût', async () => {
    const t = await createTenant()
    actAs(t)
    const p = await createProduct(t.companyId, t.depotId)
    const supplierId = await supplierOf(t.companyId)
    await receive(t, supplierId, p.variantId, 10, 300)
    await receive(t, supplierId, p.variantId, 10, 400) // CMP 350, 20 en stock

    const orderId = await sell(t, p.variantId, 4, 500)
    const [line] = await sql`SELECT unit_cost::float AS c FROM sales_order_items WHERE sales_order_id = ${orderId}`
    expect(line.c).toBe(350)
    const [out] = await sql`
      SELECT unit_cost::float AS c FROM stock_movements WHERE reference_id = ${orderId} AND movement_type = 'sale'
    `
    expect(out.c).toBe(350)
    expect(await cmp(t.depotId, p.variantId)).toBe(350) // une sortie ne change pas le CMP

    // Le prix fournisseur change : la vente garde son coût
    await receive(t, supplierId, p.variantId, 4, 500) // (16 × 350 + 4 × 500) / 20 = 380
    expect(await cmp(t.depotId, p.variantId)).toBe(380)
    const [again] = await sql`SELECT unit_cost::float AS c FROM sales_order_items WHERE sales_order_id = ${orderId}`
    expect(again.c).toBe(350)

    // Annulation : 4 unités réintégrées à 350 → (20 × 380 + 4 × 350) / 24 = 375
    await changeSaleStatus({ companyId: t.companyId, userId: t.userId, orderId, status: 'cancelled' })
    expect(await stockOf(t.depotId, p.variantId)).toBe(24)
    const [back] = await sql`
      SELECT unit_cost::float AS c FROM stock_movements
      WHERE reference_id = ${orderId} AND movement_type = 'return'
    `
    expect(back.c).toBe(350)
    expect(await cmp(t.depotId, p.variantId)).toBe(375)
    expect(await journalValue(t.depotId, p.variantId)).toBe(24 * 375)
  })

  it('retours clients (direct et module Retours) réintégrés au coût d’origine de la vente', async () => {
    const t = await createTenant()
    actAs(t)
    const p = await createProduct(t.companyId, t.depotId)
    const supplierId = await supplierOf(t.companyId)
    await receive(t, supplierId, p.variantId, 10, 300)
    const orderId = await sell(t, p.variantId, 5, 500) // coût figé 300
    await receive(t, supplierId, p.variantId, 5, 600) // (5 × 300 + 5 × 600) / 10 = 450

    const direct = await json(await saleReturn.POST(
      req('POST', { items: [{ productVariantId: p.variantId, quantity: 2 }] }),
      params(orderId)
    ))
    expect(direct.status).toBe(200)
    // (10 × 450 + 2 × 300) / 12 = 425
    expect(await cmp(t.depotId, p.variantId)).toBe(425)

    const created = await json(await returns.POST(req('POST', {
      return_type: 'client', client_id: t.clientId, sales_order_id: orderId, depot_id: t.depotId,
      items: [{ product_variant_id: p.variantId, quantity: 1, condition: 'good' }],
    })))
    expect(created.status).toBe(200)
    const processed = await json(await returnProcess.POST(req('POST', { action: 'approve' }), params(created.body.data.id)))
    expect(processed.status).toBe(200)

    const entries = await sql`
      SELECT unit_cost::float AS c FROM stock_movements
      WHERE product_variant_id = ${p.variantId} AND movement_type = 'return'
    `
    expect(entries.map((e) => e.c)).toEqual([300, 300])
    expect(await stockOf(t.depotId, p.variantId)).toBe(13)
    // (12 × 425 + 1 × 300) / 13
    expect(await cmp(t.depotId, p.variantId)).toBeCloseTo(5400 / 13, 3)
  })

  it('point de vente : le coût est figé sur les lignes du ticket à l’encaissement', async () => {
    const t = await createTenant()
    actAs(t)
    const p = await createProduct(t.companyId, t.depotId, { price: 700 })
    await receive(t, await supplierOf(t.companyId), p.variantId, 10, 420)
    const actor = { companyId: t.companyId, userId: t.userId, canManage: false }
    const ticket = await openPosOrder(actor, { depotId: t.depotId, orderType: 'counter' })
    await addPosItems(actor, ticket.id, [{ variantId: p.variantId, quantity: 3 }])
    const paid = await payPosOrder(actor, ticket.id, { paymentMethod: 'cash', paidAmount: 2100 })

    const [posLine] = await sql`SELECT unit_cost::float AS c FROM pos_order_items WHERE pos_order_id = ${ticket.id}`
    expect(posLine.c).toBe(420)
    const [saleLine] = await sql`SELECT unit_cost::float AS c FROM sales_order_items WHERE sales_order_id = ${paid.saleId}`
    expect(saleLine.c).toBe(420)
  })
})

describe('Transferts entre dépôts', () => {
  it('le transfert entrant est valorisé au coût du dépôt source', async () => {
    const t = await createTenant()
    actAs(t)
    const [d2] = await sql`INSERT INTO depots (company_id, name) VALUES (${t.companyId}, 'Dépôt 2') RETURNING id`
    const dest = d2.id as string
    const p = await createProduct(t.companyId, t.depotId)
    const supplierId = await supplierOf(t.companyId)
    await receive(t, supplierId, p.variantId, 10, 300)
    await receive(t, supplierId, p.variantId, 10, 400) // source : CMP 350
    await receive(t, supplierId, p.variantId, 10, 200, dest) // destination : CMP 200

    const created = await json(await transfers.POST(req('POST', {
      source_depot_id: t.depotId, destination_depot_id: dest,
      items: [{ item_type: 'product', product_variant_id: p.variantId, quantity: 10 }],
    })))
    expect(created.status).toBe(201)
    const received = await json(await transferReceive.POST(req('POST', {}), params(created.body.data.id)))
    expect(received.status).toBeLessThan(300)

    expect(await cmp(t.depotId, p.variantId)).toBe(350)
    // (10 × 200 + 10 × 350) / 20 = 275
    expect(await cmp(dest, p.variantId)).toBe(275)
    const [entry] = await sql`
      SELECT unit_cost::float AS c FROM stock_movements
      WHERE depot_id = ${dest} AND movement_type = 'transfer' AND quantity > 0
    `
    expect(entry.c).toBe(350)
    expect(await journalValue(t.depotId, p.variantId)).toBe(10 * 350)
    expect(await journalValue(dest, p.variantId)).toBe(20 * 275)
  })
})

describe('Rapports', () => {
  it('marge brute réelle par produit, client, commercial et dépôt (retours déduits, annulations exclues)', async () => {
    const t = await createTenant()
    actAs(t)
    const supplierId = await supplierOf(t.companyId)
    const p1 = await createProduct(t.companyId, t.depotId)
    const p2 = await createProduct(t.companyId, t.depotId)
    await sql`UPDATE products SET name = 'Flag 65cl' WHERE id = ${p2.productId}`
    const [agent] = await sql`
      INSERT INTO sales_agents (company_id, full_name) VALUES (${t.companyId}, 'Kouassi') RETURNING id
    `
    await receive(t, supplierId, p1.variantId, 20, 300)
    await receive(t, supplierId, p2.variantId, 20, 100)

    const o1 = await sell(t, p1.variantId, 4, 500, { agentId: agent.id }) // CA 2000, coût 1200
    await sell(t, p2.variantId, 10, 150) // CA 1500, coût 1000
    const cancelled = await sell(t, p1.variantId, 3, 500)
    await changeSaleStatus({ companyId: t.companyId, userId: t.userId, orderId: cancelled, status: 'cancelled' })
    // Retour d'une unité de p1 : CA −500, coût −300
    await saleReturn.POST(req('POST', { items: [{ productVariantId: p1.variantId, quantity: 1 }] }), params(o1))

    // Le prix fournisseur change après coup : la marge passée ne bouge pas
    await sql`UPDATE product_variants SET cost_price = 999 WHERE id = ${p1.variantId}`
    await receive(t, supplierId, p1.variantId, 5, 800)

    const today = todayIso()
    const res = await json(await marginReport.GET(req('GET', undefined, `http://localhost/api/reports/margin?from=${today}&to=${today}`)))
    expect(res.status).toBe(200)
    const r = res.body.data
    expect(r.totals).toMatchObject({ revenue: 3000, cost: 1900, margin: 1100, rate: 36.7, quantity: 13, missingCost: 0 })

    const prod1 = r.byProduct.find((g: any) => g.key === p1.variantId)
    expect(prod1).toMatchObject({ quantity: 3, revenue: 1500, cost: 900, margin: 600, rate: 40 })
    const prod2 = r.byProduct.find((g: any) => g.key === p2.variantId)
    expect(prod2).toMatchObject({ label: 'Flag 65cl', revenue: 1500, cost: 1000, margin: 500 })

    expect(r.byClient).toHaveLength(1)
    expect(r.byClient[0]).toMatchObject({ key: t.clientId, margin: 1100 })
    expect(r.byAgent.find((g: any) => g.key === agent.id)).toMatchObject({ label: 'Kouassi', margin: 600 })
    expect(r.byAgent.find((g: any) => g.key === 'none')).toMatchObject({ label: 'Sans commercial', margin: 500 })
    expect(r.byDepot).toHaveLength(1)
    expect(r.byDepot[0]).toMatchObject({ key: t.depotId, revenue: 3000 })
    expect(r.byMonth).toHaveLength(1)

    // Période sans vente
    const empty = await json(await marginReport.GET(req('GET', undefined, 'http://localhost/api/reports/margin?from=2020-01-01&to=2020-01-31')))
    expect(empty.body.data.totals).toMatchObject({ revenue: 0, cost: 0, margin: 0, rate: null })
    // Dates incohérentes
    const bad = await json(await marginReport.GET(req('GET', undefined, `http://localhost/api/reports/margin?from=${today}&to=2020-01-01`)))
    expect(bad.status).toBe(400)
  })

  it('valeur du stock actuelle au CMP et à une date passée (bilan au 31 décembre)', async () => {
    const t = await createTenant()
    actAs(t)
    const p = await createProduct(t.companyId, t.depotId)
    const supplierId = await supplierOf(t.companyId)

    const po1 = await receive(t, supplierId, p.variantId, 10, 300)
    // Cette première réception date de décembre dernier
    await sql`UPDATE stock_movements SET created_at = '2025-12-20 10:00' WHERE reference_id = ${po1}`

    await receive(t, supplierId, p.variantId, 10, 400) // CMP 350
    const orderId = await sell(t, p.variantId, 5, 500) // sortie à 350
    expect(orderId).toBeTruthy()

    const url = 'http://localhost/api/reports/stock-value'
    const now = await json(await stockValue.GET(req('GET', undefined, url)))
    expect(now.status).toBe(200)
    expect(now.body.data).toMatchObject({ at: null, totalQuantity: 15, totalValue: 5250 })
    expect(now.body.data.lines[0]).toMatchObject({ variantId: p.variantId, quantity: 15, value: 5250, unitCost: 350 })

    const endOfYear = await json(await stockValue.GET(req('GET', undefined, `${url}?at=2025-12-31`)))
    expect(endOfYear.body.data).toMatchObject({ at: '2025-12-31', totalQuantity: 10, totalValue: 3000 })
    expect(endOfYear.body.data.byDepot).toEqual([
      { depotId: t.depotId, depotName: 'Dépôt', quantity: 10, value: 3000 },
    ])

    const before = await json(await stockValue.GET(req('GET', undefined, `${url}?at=2025-12-19`)))
    expect(before.body.data).toMatchObject({ totalQuantity: 0, totalValue: 0, lines: [] })

    const today = await json(await stockValue.GET(req('GET', undefined, `${url}?at=${todayIso()}`)))
    expect(today.body.data.totalValue).toBe(5250)

    const future = await json(await stockValue.GET(req('GET', undefined, `${url}?at=2999-01-01`)))
    expect(future.status).toBe(400)
  })
})
