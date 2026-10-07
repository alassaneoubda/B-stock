import { describe, expect, it } from 'vitest'
import { actAs, json, params, req } from './route-helpers'
import { sql, withTransaction } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { addStock, unpackStock } from '@/lib/domain/stock'
import { changeSaleStatus, createSale } from '@/lib/domain/sales'
import {
  addPosItems,
  getPosCatalog,
  openPosOrder,
  payPosOrder,
  setPosAutoUnpack,
  type PosActor,
} from '@/lib/domain/pos'
import { createProduct, createTenant, stockOf } from './helpers'
import * as unitVariant from '@/app/api/products/[id]/unit-variant/route'
import * as unpackRoute from '@/app/api/stock/unpack/route'
import * as stockRoute from '@/app/api/stock/route'
import * as stockExport from '@/app/api/stock/export/route'
import * as saleReturn from '@/app/api/sales/[id]/return/route'
import * as inventory from '@/app/api/inventory/route'
import * as inventoryItems from '@/app/api/inventory/[id]/route'
import * as inventoryComplete from '@/app/api/inventory/[id]/complete/route'
import * as inventoryDue from '@/app/api/inventory/due/route'

type Tenant = Awaited<ReturnType<typeof createTenant>>

/** Produit « Bock » avec une variante casier de 12 (prix 7 200, prix d'achat catalogue 6 000). */
async function createCrateProduct(t: Tenant, opts: { category?: string; brand?: string; name?: string } = {}) {
  const [product] = await sql`
    INSERT INTO products (company_id, name, category, brand, selling_price, purchase_price)
    VALUES (${t.companyId}, ${opts.name ?? 'Bock'}, ${opts.category ?? 'Bière'}, ${opts.brand ?? 'Solibra'}, 7200, 6000)
    RETURNING id
  `
  const [pt] = await sql`
    INSERT INTO packaging_types (company_id, name, description, units_per_case, is_returnable)
    VALUES (${t.companyId}, '66 cl · Casier de 12', 'Casier de 12 bouteilles de 66 cl', 12, true)
    RETURNING id
  `
  const [variant] = await sql`
    INSERT INTO product_variants (product_id, packaging_type_id, price, cost_price)
    VALUES (${product.id}, ${pt.id}, 7200, 6000) RETURNING id
  `
  return { productId: product.id as string, packVariantId: variant.id as string }
}

async function receiveAt(t: Tenant, variantId: string, quantity: number, unitCost: number) {
  await withTransaction((tx) =>
    addStock(tx, {
      companyId: t.companyId, depotId: t.depotId, variantId, quantity, unitCost,
      movementType: 'purchase', userId: t.userId,
    })
  )
}

async function enableUnit(t: Tenant, productId: string, packVariantId: string, price = 700) {
  const res = await json(await unitVariant.POST(req('POST', { packVariantId, price }), params(productId)))
  expect(res.status).toBe(201)
  return res.body.data.unitVariantId as string
}

/** Valeur du dépôt pour des variantes : Σ quantité × CMP. */
async function depotValue(depotId: string, variantIds: string[]): Promise<number> {
  const [row] = await sql`
    SELECT COALESCE(SUM(s.quantity * sc.avg_cost), 0)::float AS v
    FROM stock s
    JOIN stock_costs sc ON sc.depot_id = s.depot_id AND sc.product_variant_id = s.product_variant_id
    WHERE s.depot_id = ${depotId} AND s.product_variant_id = ANY(${variantIds}::uuid[])
  `
  return row.v
}

async function journalValue(depotId: string, variantIds: string[]): Promise<number> {
  const [row] = await sql`
    SELECT COALESCE(SUM(quantity * unit_cost), 0)::float AS v FROM stock_movements
    WHERE depot_id = ${depotId} AND product_variant_id = ANY(${variantIds}::uuid[])
  `
  return row.v
}

async function expectAppError(promise: Promise<unknown>, status: number, code?: string): Promise<AppError> {
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

describe('Vente à la bouteille — variante unité', () => {
  it('crée la variante unité liée au casier (emballage 1 unité, consigné comme le casier)', async () => {
    const t = await createTenant()
    actAs(t)
    const { productId, packVariantId } = await createCrateProduct(t)
    const unitId = await enableUnit(t, productId, packVariantId, 650)

    const [unit] = await sql`
      SELECT pv.product_id, pv.price::float AS price, pv.cost_price::float AS cost_price,
             pt.name, pt.units_per_case, pt.is_returnable
      FROM product_variants pv JOIN packaging_types pt ON pt.id = pv.packaging_type_id
      WHERE pv.id = ${unitId}
    `
    expect(unit.product_id).toBe(productId)
    expect(unit.price).toBe(650)
    expect(unit.cost_price).toBe(500)
    expect(unit.name).toBe('66 cl · Bouteille')
    expect(unit.units_per_case).toBe(1)
    expect(unit.is_returnable).toBe(true)
    const [pack] = await sql`SELECT unit_variant_id FROM product_variants WHERE id = ${packVariantId}`
    expect(pack.unit_variant_id).toBe(unitId)

    // Une seule activation par casier
    const again = await json(await unitVariant.POST(req('POST', { packVariantId, price: 650 }), params(productId)))
    expect(again.status).toBe(409)
  })
})

describe('Ouverture de casier', () => {
  it('sortie de N casiers, entrée de N × 12 bouteilles au coût du casier / 12 : valeur conservée', async () => {
    const t = await createTenant()
    actAs(t)
    const { productId, packVariantId } = await createCrateProduct(t)
    const unitId = await enableUnit(t, productId, packVariantId)
    await receiveAt(t, packVariantId, 5, 6000)
    const ids = [packVariantId, unitId]
    const before = await depotValue(t.depotId, ids)
    expect(before).toBe(30000)

    const res = await json(await unpackRoute.POST(req('POST', { depotId: t.depotId, packVariantId, packs: 2 })))
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ packs: 2, units: 24, packUnitCost: 6000, unitCost: 500 })

    expect(await stockOf(t.depotId, packVariantId)).toBe(3)
    expect(await stockOf(t.depotId, unitId)).toBe(24)
    const [cmp] = await sql`
      SELECT avg_cost::float AS c FROM stock_costs WHERE depot_id = ${t.depotId} AND product_variant_id = ${unitId}
    `
    expect(cmp.c).toBe(500)
    expect(await depotValue(t.depotId, ids)).toBe(before)
    expect(await journalValue(t.depotId, ids)).toBe(before)

    const moves = await sql`
      SELECT product_variant_id, quantity, unit_cost::float AS c, reference_type FROM stock_movements
      WHERE movement_type = 'unpack' AND depot_id = ${t.depotId} ORDER BY quantity
    `
    expect(moves.map((m) => [m.product_variant_id, m.quantity, m.c, m.reference_type])).toEqual([
      [packVariantId, -2, 6000, 'stock_unpack'],
      [unitId, 24, 500, 'stock_unpack'],
    ])

    // Historique
    const history = await json(await unpackRoute.GET(req('GET', undefined, `http://localhost/api/stock/unpack?productId=${productId}`)))
    expect(history.body.data).toHaveLength(1)
    expect(history.body.data[0]).toMatchObject({ packs: 2, units: 24, source: 'manual', value: 12000 })
  })

  it('coût non divisible et bouteilles déjà en stock : valeur conservée au centime de coût près', async () => {
    const t = await createTenant()
    actAs(t)
    const { productId, packVariantId } = await createCrateProduct(t)
    const unitId = await enableUnit(t, productId, packVariantId)
    await receiveAt(t, packVariantId, 3, 7000)
    await receiveAt(t, unitId, 5, 550)
    const ids = [packVariantId, unitId]
    const before = await depotValue(t.depotId, ids)

    await withTransaction((tx) =>
      unpackStock(tx, { companyId: t.companyId, depotId: t.depotId, packVariantId, packs: 1, userId: t.userId })
    )
    expect(await stockOf(t.depotId, unitId)).toBe(17)
    expect(await depotValue(t.depotId, ids)).toBeCloseTo(before, 0)
    expect(await journalValue(t.depotId, ids)).toBeCloseTo(before, 0)
  })

  it('refuse sans variante unité, ou au-delà du stock de casiers (rien n’est modifié)', async () => {
    const t = await createTenant()
    actAs(t)
    const { productId, packVariantId } = await createCrateProduct(t)
    await receiveAt(t, packVariantId, 1, 6000)
    const noUnit = await json(await unpackRoute.POST(req('POST', { depotId: t.depotId, packVariantId, packs: 1 })))
    expect(noUnit.status).toBe(409)
    expect(noUnit.body.code).toBe('NO_UNIT_VARIANT')

    const unitId = await enableUnit(t, productId, packVariantId)
    const tooMany = await json(await unpackRoute.POST(req('POST', { depotId: t.depotId, packVariantId, packs: 2 })))
    expect(tooMany.status).toBe(409)
    expect(await stockOf(t.depotId, packVariantId)).toBe(1)
    expect(await stockOf(t.depotId, unitId)).toBe(0)
    const [n] = await sql`SELECT COUNT(*)::int AS n FROM stock_unpacks WHERE company_id = ${t.companyId}`
    expect(n.n).toBe(0)
  })
})

describe('Point de vente — ouverture de casier', () => {
  async function setupPos() {
    const t = await createTenant()
    actAs(t)
    const { productId, packVariantId } = await createCrateProduct(t)
    const unitId = await enableUnit(t, productId, packVariantId, 700)
    await receiveAt(t, packVariantId, 2, 6000)
    const actor: PosActor = { companyId: t.companyId, userId: t.userId, canManage: false }
    const { id: orderId } = await openPosOrder(actor, { depotId: t.depotId, orderType: 'counter' })
    return { ...t, productId, packVariantId, unitId, actor, orderId }
  }

  it('bouteilles épuisées : propose l’ouverture, puis ouvre le casier sur confirmation', async () => {
    const s = await setupPos()
    const catalog = await getPosCatalog(s.companyId, s.depotId)
    const unitLine = catalog.find((c) => c.variant_id === s.unitId)!
    expect(unitLine.available).toBe(0)
    expect(unitLine.openable).toBe(24)

    const err = await expectAppError(
      addPosItems(s.actor, s.orderId, [{ variantId: s.unitId, quantity: 3 }]),
      409,
      'UNPACK_REQUIRED'
    )
    expect(err.details).toMatchObject({ packVariantId: s.packVariantId, packs: 1, unitsPerPack: 12, available: 0 })
    expect(await stockOf(s.depotId, s.packVariantId)).toBe(2)

    await addPosItems(s.actor, s.orderId, [{ variantId: s.unitId, quantity: 3 }], { unpack: true })
    expect(await stockOf(s.depotId, s.packVariantId)).toBe(1)
    expect(await stockOf(s.depotId, s.unitId)).toBe(12)
    const [unpack] = await sql`SELECT source, pos_order_id, packs FROM stock_unpacks WHERE company_id = ${s.companyId}`
    expect(unpack).toMatchObject({ source: 'pos', pos_order_id: s.orderId, packs: 1 })

    // 9 bouteilles restent disponibles : pas de nouvelle ouverture
    await addPosItems(s.actor, s.orderId, [{ variantId: s.unitId, quantity: 9 }])
    expect(await stockOf(s.depotId, s.packVariantId)).toBe(1)

    // Encaissement : 12 bouteilles vendues au coût de 500
    const { saleId } = await payPosOrder(s.actor, s.orderId, { paymentMethod: 'cash', paidAmount: 12 * 700 })
    expect(await stockOf(s.depotId, s.unitId)).toBe(0)
    const [line] = await sql`
      SELECT SUM(quantity)::int AS q, MAX(unit_cost)::float AS c FROM sales_order_items WHERE sales_order_id = ${saleId}
    `
    expect(line).toMatchObject({ q: 12, c: 500 })
  })

  it('réglage « ouverture automatique » : le casier est ouvert sans confirmation', async () => {
    const s = await setupPos()
    await setPosAutoUnpack(s.companyId, true)
    await addPosItems(s.actor, s.orderId, [{ variantId: s.unitId, quantity: 14 }])
    // 14 bouteilles = 2 casiers ouverts
    expect(await stockOf(s.depotId, s.packVariantId)).toBe(0)
    expect(await stockOf(s.depotId, s.unitId)).toBe(24)
    // Plus aucun casier : rupture classique
    await expectAppError(addPosItems(s.actor, s.orderId, [{ variantId: s.unitId, quantity: 11 }]), 409, 'INSUFFICIENT_STOCK')
  })

  it('les casiers réservés par d’autres tickets ne sont pas ouverts', async () => {
    const s = await setupPos()
    const other = await openPosOrder(s.actor, { depotId: s.depotId, orderType: 'counter' })
    await addPosItems(s.actor, other.id, [{ variantId: s.packVariantId, quantity: 2 }])
    await expectAppError(
      addPosItems(s.actor, s.orderId, [{ variantId: s.unitId, quantity: 1 }], { unpack: true }),
      409,
      'INSUFFICIENT_STOCK'
    )
    expect(await stockOf(s.depotId, s.packVariantId)).toBe(2)
  })
})

describe('Annulation d’une vente après un retour direct', () => {
  it('ne réintègre que la quantité non retournée', async () => {
    const t = await createTenant()
    actAs(t)
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 20 }] })
    const { order } = await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'credit', paidAmount: 0,
      items: [{ productVariantId: p.variantId, quantity: 10, unitPrice: 500 }],
    })
    expect(await stockOf(t.depotId, p.variantId)).toBe(10)

    const ret = await json(await saleReturn.POST(
      req('POST', { items: [{ productVariantId: p.variantId, quantity: 4 }] }),
      params(order.id as string)
    ))
    expect(ret.status).toBe(200)
    expect(await stockOf(t.depotId, p.variantId)).toBe(14)

    await changeSaleStatus({ companyId: t.companyId, userId: t.userId, orderId: order.id as string, status: 'cancelled' })
    // 20 au départ : 10 vendus, 4 retournés, 6 réintégrés à l'annulation (et non 10)
    expect(await stockOf(t.depotId, p.variantId)).toBe(20)
  })

  it('sans retour, l’annulation réintègre toujours tout', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 8 }] })
    const { order } = await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'cash', paidAmount: 1500,
      items: [{ productVariantId: p.variantId, quantity: 3, unitPrice: 500 }],
    })
    await changeSaleStatus({ companyId: t.companyId, userId: t.userId, orderId: order.id as string, status: 'cancelled' })
    expect(await stockOf(t.depotId, p.variantId)).toBe(8)
  })
})

describe('Valeur du stock au CMP', () => {
  it('API stock et export : valorisés au CMP du dépôt, repli sur le prix d’achat sans CMP', async () => {
    const t = await createTenant()
    actAs(t)
    const withCmp = await createCrateProduct(t, { name: 'Avec CMP' })
    await receiveAt(t, withCmp.packVariantId, 4, 5500) // CMP 5 500 ≠ prix d'achat catalogue 6 000
    const noCmp = await createCrateProduct(t, { name: 'Sans CMP' })
    await sql`
      INSERT INTO stock (depot_id, product_variant_id, quantity) VALUES (${t.depotId}, ${noCmp.packVariantId}, 2)
    `

    const res = await json(await stockRoute.GET(req('GET', undefined, 'http://localhost/api/stock')))
    expect(res.status).toBe(200)
    const a = res.body.data.find((r: any) => r.variant_id === withCmp.packVariantId)
    const b = res.body.data.find((r: any) => r.variant_id === noCmp.packVariantId)
    expect(a).toMatchObject({ avg_cost: 5500, stock_value: 22000 })
    expect(b).toMatchObject({ avg_cost: 6000, stock_value: 12000 })

    const exp = await json(await stockExport.GET(req('GET', undefined, 'http://localhost/api/stock/export')))
    const ea = exp.body.data.products.find((r: any) => r.variant_id === withCmp.packVariantId)
    const eb = exp.body.data.products.find((r: any) => r.variant_id === noCmp.packVariantId)
    expect(Number(ea.purchase_price)).toBe(5500)
    expect(Number(eb.purchase_price)).toBe(6000)
  })
})

describe('Inventaire tournant', () => {
  it('inventaire partiel par catégorie : seules les lignes comptées sont ajustées, date de comptage enregistrée', async () => {
    const t = await createTenant()
    actAs(t)
    const beer = await createCrateProduct(t, { name: 'Bière A', category: 'Bière' })
    const soda = await createCrateProduct(t, { name: 'Soda B', category: 'Sucrerie' })
    await receiveAt(t, beer.packVariantId, 10, 6000)
    await receiveAt(t, soda.packVariantId, 10, 3000)

    const created = await json(await inventory.POST(req('POST', {
      depot_id: t.depotId, scope: { type: 'category', category: 'Bière' },
    })))
    expect(created.status).toBe(200)
    expect(created.body.data.inventory_type).toBe('partial')
    expect(created.body.data.total_items).toBe(1) // pas d'emballages dans un partiel
    const sessionId = created.body.data.id as string

    const lines = await sql`SELECT id, product_variant_id, unit_value::float AS v FROM inventory_items WHERE inventory_session_id = ${sessionId}`
    expect(lines.map((l) => l.product_variant_id)).toEqual([beer.packVariantId])
    expect(lines[0].v).toBe(6000) // valorisé au CMP

    // Le soda bouge pendant l'inventaire : il ne doit pas être touché à la finalisation
    await sql`UPDATE stock SET quantity = 7 WHERE depot_id = ${t.depotId} AND product_variant_id = ${soda.packVariantId}`

    await inventoryItems.PUT(req('PUT', { items: [{ id: lines[0].id, counted_quantity: 8 }] }), params(sessionId))
    const done = await json(await inventoryComplete.POST(req('POST', { apply_adjustments: true }), params(sessionId)))
    expect(done.status).toBe(200)
    expect(done.body.data.total_variance_value).toBe(-12000)

    expect(await stockOf(t.depotId, beer.packVariantId)).toBe(8)
    expect(await stockOf(t.depotId, soda.packVariantId)).toBe(7)
    const [move] = await sql`
      SELECT quantity, unit_cost::float AS c FROM stock_movements
      WHERE product_variant_id = ${beer.packVariantId} AND movement_type = 'inventory'
    `
    expect(move).toMatchObject({ quantity: -2, c: 6000 })

    const counts = await sql`SELECT product_variant_id, last_inventory_id FROM stock_counts WHERE depot_id = ${t.depotId}`
    expect(counts).toEqual([{ product_variant_id: beer.packVariantId, last_inventory_id: sessionId }])

    // « À compter cette semaine » : le soda (jamais compté) passe avant la bière (comptée)
    const due = await json(await inventoryDue.GET(req('GET', undefined, `http://localhost/api/inventory/due?depotId=${t.depotId}&weeks=1`)))
    expect(due.body.data).toMatchObject({ totalVariants: 2, weeklyQuota: 2, countedThisWeek: 1, neverCounted: 1 })
    expect(due.body.data.items.map((i: any) => i.variant_id)).toEqual([soda.packVariantId])
    expect(due.body.data.categories).toEqual(expect.arrayContaining(['Bière', 'Sucrerie']))
  })

  it('« les N moins récemment comptés » et sélection explicite', async () => {
    const t = await createTenant()
    actAs(t)
    const a = await createCrateProduct(t, { name: 'A' })
    const b = await createCrateProduct(t, { name: 'B' })
    const c = await createCrateProduct(t, { name: 'C' })
    await sql`
      INSERT INTO stock_counts (depot_id, product_variant_id, last_counted_at) VALUES
        (${t.depotId}, ${a.packVariantId}, NOW() - INTERVAL '3 days'),
        (${t.depotId}, ${b.packVariantId}, NOW() - INTERVAL '30 days')
    `
    const oldest = await json(await inventory.POST(req('POST', { depot_id: t.depotId, scope: { type: 'oldest', limit: 2 } })))
    const oldestLines = await sql`SELECT product_variant_id FROM inventory_items WHERE inventory_session_id = ${oldest.body.data.id}`
    expect(oldestLines.map((l) => l.product_variant_id).sort()).toEqual([b.packVariantId, c.packVariantId].sort())

    const selection = await json(await inventory.POST(req('POST', {
      depot_id: t.depotId, scope: { type: 'selection', variantIds: [a.packVariantId] },
    })))
    expect(selection.body.data.total_items).toBe(1)

    // Variante d'une autre entreprise : refusée
    const other = await createTenant()
    const foreign = await createCrateProduct(other)
    const denied = await json(await inventory.POST(req('POST', {
      depot_id: t.depotId, scope: { type: 'selection', variantIds: [foreign.packVariantId] },
    })))
    expect(denied.status).toBe(404)

    const empty = await json(await inventory.POST(req('POST', { depot_id: t.depotId, scope: { type: 'brand', brand: 'Inconnue' } })))
    expect(empty.status).toBe(400)
  })
})
