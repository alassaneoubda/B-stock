import { describe, expect, it } from 'vitest'
import { actAs, json, params, req } from './route-helpers'
import { sql } from '@/lib/db'
import { createProduct, createTenant, stockOf } from './helpers'
import * as procurement from '@/app/api/procurement/route'
import * as transfers from '@/app/api/transfers/route'
import * as transferReceive from '@/app/api/transfers/[id]/receive/route'
import * as inventory from '@/app/api/inventory/route'
import * as inventoryItems from '@/app/api/inventory/[id]/route'
import * as inventoryComplete from '@/app/api/inventory/[id]/complete/route'
import * as breakage from '@/app/api/breakage/route'
import * as breakageApprove from '@/app/api/breakage/[id]/approve/route'

async function createSupplier(companyId: string) {
  const [s] = await sql`INSERT INTO suppliers (company_id, name) VALUES (${companyId}, 'Solibra') RETURNING id`
  return s.id as string
}

async function secondDepot(companyId: string) {
  const [d] = await sql`INSERT INTO depots (company_id, name) VALUES (${companyId}, 'Dépôt 2') RETURNING id`
  return d.id as string
}

describe('Approvisionnement', () => {
  it('réception partielle puis solde : quantités cumulées, statut correct, pas de double réception', async () => {
    const t = await createTenant()
    actAs(t)
    const p = await createProduct(t.companyId, t.depotId)
    const supplierId = await createSupplier(t.companyId)

    const created = await json(await procurement.POST(req('POST', {
      supplierId, depotId: t.depotId,
      items: [{ productVariantId: p.variantId, quantityOrdered: 10, unitPrice: 300 }],
    })))
    expect(created.status).toBeLessThan(300)
    const [po] = await sql`SELECT id, order_number, status FROM purchase_orders WHERE company_id = ${t.companyId}`
    expect(po.order_number).toBe('ACH-000001')
    const [item] = await sql`SELECT id FROM purchase_order_items WHERE purchase_order_id = ${po.id}`

    const r1 = await json(await procurement.POST(req('POST', {
      purchaseOrderId: po.id, items: [{ itemId: item.id, quantityReceived: 6, quantityDamaged: 1 }],
    })))
    expect(r1.status).toBeLessThan(300)
    expect(await stockOf(t.depotId, p.variantId)).toBe(6) // les unités cassées n'entrent pas en stock
    let [state] = await sql`SELECT status FROM purchase_orders WHERE id = ${po.id}`
    expect(state.status).toBe('partial')

    // Reste à recevoir : 10 - 6 - 1 = 3 → en recevoir 4 est refusé
    const tooMuch = await json(await procurement.POST(req('POST', {
      purchaseOrderId: po.id, items: [{ itemId: item.id, quantityReceived: 4 }],
    })))
    expect(tooMuch.status).toBe(409)

    await procurement.POST(req('POST', { purchaseOrderId: po.id, items: [{ itemId: item.id, quantityReceived: 3 }] }))
    ;[state] = await sql`SELECT status FROM purchase_orders WHERE id = ${po.id}`
    expect(state.status).toBe('received')
    expect(await stockOf(t.depotId, p.variantId)).toBe(9)

    const again = await json(await procurement.POST(req('POST', {
      purchaseOrderId: po.id, items: [{ itemId: item.id, quantityReceived: 1 }],
    })))
    expect(again.status).toBe(409)
    expect(await stockOf(t.depotId, p.variantId)).toBe(9)
  })

  it('isolation : impossible de commander vers le dépôt d’une autre entreprise', async () => {
    const a = await createTenant('A')
    const b = await createTenant('B')
    actAs(a)
    const p = await createProduct(a.companyId, a.depotId)
    const supplierId = await createSupplier(a.companyId)
    const res = await json(await procurement.POST(req('POST', {
      supplierId, depotId: b.depotId,
      items: [{ productVariantId: p.variantId, quantityOrdered: 1, unitPrice: 1 }],
    })))
    expect(res.status).toBe(404)
  })
})

describe('Transferts', () => {
  it('réception : source débitée, destination créditée, une seule fois', async () => {
    const t = await createTenant()
    actAs(t)
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: 'L1', qty: 10 }] })
    const dest = await secondDepot(t.companyId)

    const created = await json(await transfers.POST(req('POST', {
      source_depot_id: t.depotId, destination_depot_id: dest,
      items: [{ item_type: 'product', product_variant_id: p.variantId, quantity: 4 }],
    })))
    expect(created.status).toBe(201)
    expect(created.body.data.transfer_number).toBe('TRF-00001')
    expect(await stockOf(t.depotId, p.variantId)).toBe(10) // rien ne bouge à la création

    const received = await json(await transferReceive.POST(req('POST', {}), params(created.body.data.id)))
    expect(received.status).toBeLessThan(300)
    expect(await stockOf(t.depotId, p.variantId)).toBe(6)
    expect(await stockOf(dest, p.variantId)).toBe(4)
    const [destLot] = await sql`SELECT lot_number FROM stock WHERE depot_id = ${dest}`
    expect(destLot.lot_number).toBe('L1')

    const twice = await json(await transferReceive.POST(req('POST', {}), params(created.body.data.id)))
    expect(twice.status).toBe(409)
    expect(await stockOf(dest, p.variantId)).toBe(4)
  })

  it('stock source insuffisant : réception refusée, rien ne bouge', async () => {
    const t = await createTenant()
    actAs(t)
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 2 }] })
    const dest = await secondDepot(t.companyId)
    const created = await json(await transfers.POST(req('POST', {
      source_depot_id: t.depotId, destination_depot_id: dest,
      items: [{ item_type: 'product', product_variant_id: p.variantId, quantity: 5 }],
    })))
    const res = await json(await transferReceive.POST(req('POST', {}), params(created.body.data.id)))
    expect(res.status).toBe(409)
    expect(await stockOf(t.depotId, p.variantId)).toBe(2)
    expect(await stockOf(dest, p.variantId)).toBe(0)
  })
})

describe('Inventaire', () => {
  it('l’écart est appliqué par rapport au stock actuel, et une seule fois', async () => {
    const t = await createTenant()
    actAs(t)
    const p = await createProduct(t.companyId, t.depotId, {
      lots: [{ lot: 'A', qty: 5 }, { lot: 'B', qty: 5 }],
    })
    const created = await json(await inventory.POST(req('POST', { depot_id: t.depotId })))
    expect(created.status).toBeLessThan(300)
    const sessionId = created.body.data.id
    const [line] = await sql`
      SELECT id, system_quantity FROM inventory_items
      WHERE inventory_session_id = ${sessionId} AND product_variant_id = ${p.variantId}
    `
    expect(line.system_quantity).toBe(10)

    await inventoryItems.PUT(req('PUT', { items: [{ id: line.id, counted_quantity: 7 }] }), params(sessionId))
    const done = await json(await inventoryComplete.POST(req('POST', { apply_adjustments: true }), params(sessionId)))
    expect(done.status).toBe(200)
    // Avant : chaque lot recevait la quantité comptée (7 + 7 = 14)
    expect(await stockOf(t.depotId, p.variantId)).toBe(7)

    const again = await json(await inventoryComplete.POST(req('POST', { apply_adjustments: true }), params(sessionId)))
    expect(again.status).toBe(409)
    expect(await stockOf(t.depotId, p.variantId)).toBe(7)
  })
})

describe('Casse', () => {
  it('approbation : déduction réelle ; stock insuffisant → refus explicite', async () => {
    const t = await createTenant()
    actAs(t)
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 3 }] })

    const ok = await json(await breakage.POST(req('POST', {
      record_type: 'breakage', depot_id: t.depotId, product_variant_id: p.variantId, item_type: 'product', quantity: 2,
    })))
    const approved = await json(await breakageApprove.POST(req('POST', { action: 'approve' }), params(ok.body.data.id)))
    expect(approved.status).toBe(200)
    expect(await stockOf(t.depotId, p.variantId)).toBe(1)

    const big = await json(await breakage.POST(req('POST', {
      record_type: 'loss', depot_id: t.depotId, product_variant_id: p.variantId, item_type: 'product', quantity: 5,
    })))
    const refused = await json(await breakageApprove.POST(req('POST', { action: 'approve' }), params(big.body.data.id)))
    expect(refused.status).toBe(409)
    const [rec] = await sql`SELECT status FROM breakage_records WHERE id = ${big.body.data.id}`
    expect(rec.status).toBe('reported') // l'approbation a été annulée
    expect(await stockOf(t.depotId, p.variantId)).toBe(1)
  })
})
