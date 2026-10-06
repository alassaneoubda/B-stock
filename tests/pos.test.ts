import { describe, expect, it } from 'vitest'
import { sql } from '@/lib/db'
import { AppError } from '@/lib/errors'
import {
  addPosItems,
  cancelPosOrder,
  getPosCatalog,
  getPosOrder,
  openPosOrder,
  payPosOrder,
  reducePosItem,
  type PosActor,
} from '@/lib/domain/pos'
import { balanceOf, createProduct, createTenant, stockOf } from './helpers'

async function setup(stock = 10) {
  const t = await createTenant()
  const p = await createProduct(t.companyId, t.depotId, { price: 700, lots: [{ lot: null, qty: stock }] })
  const [table] = await sql`
    INSERT INTO pos_tables (company_id, name, area) VALUES (${t.companyId}, 'T1', 'Terrasse') RETURNING id
  `
  const actor: PosActor = { companyId: t.companyId, userId: t.userId, canManage: false }
  const manager: PosActor = { ...actor, canManage: true }
  return { ...t, ...p, tableId: table.id as string, actor, manager }
}

async function expectAppError(promise: Promise<unknown>, status: number, code?: string) {
  try {
    await promise
  } catch (e) {
    expect(e).toBeInstanceOf(AppError)
    expect((e as AppError).status).toBe(status)
    if (code) expect((e as AppError).code).toBe(code)
    return
  }
  throw new Error(`AppError ${status} attendue`)
}

describe('Point de vente — tickets', () => {
  it('une table n’a qu’un ticket ouvert (double tap → même ticket)', async () => {
    const s = await setup()
    const a = await openPosOrder(s.actor, { depotId: s.depotId, tableId: s.tableId })
    const b = await openPosOrder(s.actor, { depotId: s.depotId, tableId: s.tableId })
    expect(a.created).toBe(true)
    expect(b.created).toBe(false)
    expect(b.id).toBe(a.id)
  })

  it('les quantités des tickets ouverts sont réservées', async () => {
    const s = await setup(5)
    const t1 = await openPosOrder(s.actor, { depotId: s.depotId, tableId: s.tableId })
    await addPosItems(s.actor, t1.id, [{ variantId: s.variantId, quantity: 4 }])

    const counter = await openPosOrder(s.actor, { depotId: s.depotId, orderType: 'counter' })
    await expectAppError(addPosItems(s.actor, counter.id, [{ variantId: s.variantId, quantity: 2 }]), 409, 'INSUFFICIENT_STOCK')
    await addPosItems(s.actor, counter.id, [{ variantId: s.variantId, quantity: 1 }])

    const [item] = (await getPosCatalog(s.companyId, s.depotId)).filter((c) => c.variant_id === s.variantId)
    expect(item.reserved).toBe(5)
    expect(item.available).toBe(0)
    expect(await stockOf(s.depotId, s.variantId)).toBe(5) // rien n'est décrémenté avant l'encaissement
  })

  it('ajouts successifs regroupés, prix catalogue imposé', async () => {
    const s = await setup()
    const o = await openPosOrder(s.actor, { depotId: s.depotId, tableId: s.tableId })
    await addPosItems(s.actor, o.id, [{ variantId: s.variantId, quantity: 1 }])
    await addPosItems(s.actor, o.id, [{ variantId: s.variantId, quantity: 2 }])
    const order = await getPosOrder(s.companyId, o.id)
    expect(order.items).toHaveLength(1)
    expect(order.items[0].quantity).toBe(3)
    expect(order.total).toBe(2100)
  })

  it('correction immédiate libre ; article ancien : gérant + motif, avec trace', async () => {
    const s = await setup()
    const o = await openPosOrder(s.actor, { depotId: s.depotId, tableId: s.tableId })
    await addPosItems(s.actor, o.id, [{ variantId: s.variantId, quantity: 3 }])
    let order = await getPosOrder(s.companyId, o.id)
    await reducePosItem(s.actor, o.id, order.items[0].id, { quantity: 2 })
    order = await getPosOrder(s.companyId, o.id)
    expect(order.items[0].quantity).toBe(2)

    // On vieillit la ligne : ce n'est plus une correction immédiate
    await sql`UPDATE pos_order_items SET created_at = NOW() - INTERVAL '1 hour' WHERE pos_order_id = ${o.id}`
    await expectAppError(reducePosItem(s.actor, o.id, order.items[0].id, { quantity: 0 }), 403, 'MANAGER_REQUIRED')
    await expectAppError(reducePosItem(s.manager, o.id, order.items[0].id, { quantity: 0 }), 400, 'REASON_REQUIRED')
    await reducePosItem(s.manager, o.id, order.items[0].id, { quantity: 0, reason: 'Bouteille cassée' })

    order = await getPosOrder(s.companyId, o.id)
    expect(order.total).toBe(0)
    expect(order.items.filter((i: any) => i.status === 'void')).toHaveLength(1)
  })
})

describe('Point de vente — encaissement', () => {
  it('espèces : vente créée, stock décrémenté, ticket clos, table libérée', async () => {
    const s = await setup(10)
    const o = await openPosOrder(s.actor, { depotId: s.depotId, tableId: s.tableId })
    await addPosItems(s.actor, o.id, [{ variantId: s.variantId, quantity: 3 }])

    const result = await payPosOrder(s.actor, o.id, { paymentMethod: 'cash', paidAmount: 2100 })
    expect(result.orderNumber).toMatch(/^VNT-/)
    expect(await stockOf(s.depotId, s.variantId)).toBe(7)

    const [ticket] = await sql`SELECT status, sales_order_id FROM pos_orders WHERE id = ${o.id}`
    expect(ticket.status).toBe('paid')
    const [sale] = await sql`SELECT status, order_source FROM sales_orders WHERE id = ${ticket.sales_order_id}`
    expect(sale.status).toBe('delivered')
    expect(sale.order_source).toBe('pos')

    // La table est libre : un nouveau ticket peut s'y ouvrir
    const next = await openPosOrder(s.actor, { depotId: s.depotId, tableId: s.tableId })
    expect(next.created).toBe(true)

    // Double encaissement impossible
    await expectAppError(payPosOrder(s.actor, o.id, { paymentMethod: 'cash', paidAmount: 2100 }), 409, 'ORDER_CLOSED')
  })

  it('ardoise refusée sans client ; acceptée avec un client identifié', async () => {
    const s = await setup(10)
    const o = await openPosOrder(s.actor, { depotId: s.depotId, tableId: s.tableId })
    await addPosItems(s.actor, o.id, [{ variantId: s.variantId, quantity: 2 }])
    await expectAppError(payPosOrder(s.actor, o.id, { paymentMethod: 'credit', paidAmount: 0 }), 400, 'CLIENT_REQUIRED')

    await sql`UPDATE pos_orders SET client_id = ${s.clientId} WHERE id = ${o.id}`
    await payPosOrder(s.actor, o.id, { paymentMethod: 'credit', paidAmount: 0 })
    expect(await balanceOf(s.clientId, 'product')).toBe(-1400)
  })

  it('annulation : ticket vide libre, ticket servi réservé au gérant avec motif', async () => {
    const s = await setup(10)
    const empty = await openPosOrder(s.actor, { depotId: s.depotId, orderType: 'counter' })
    await cancelPosOrder(s.actor, empty.id, '')

    const o = await openPosOrder(s.actor, { depotId: s.depotId, tableId: s.tableId })
    await addPosItems(s.actor, o.id, [{ variantId: s.variantId, quantity: 2 }])
    await expectAppError(cancelPosOrder(s.actor, o.id, 'Client parti'), 403, 'MANAGER_REQUIRED')
    await cancelPosOrder(s.manager, o.id, 'Client parti')
    const [item] = (await getPosCatalog(s.companyId, s.depotId)).filter((c) => c.variant_id === s.variantId)
    expect(item.reserved).toBe(0) // la réservation est libérée
    expect(await stockOf(s.depotId, s.variantId)).toBe(10)
  })
})
