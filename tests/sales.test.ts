import { describe, expect, it } from 'vitest'
import { sql } from '@/lib/db'
import { changeSaleStatus, createSale } from '@/lib/domain/sales'
import { AppError } from '@/lib/errors'
import { balanceOf, createProduct, createTenant, stockOf } from './helpers'

async function expectAppError(promise: Promise<unknown>, status: number, code?: string) {
  try {
    await promise
  } catch (e) {
    expect(e).toBeInstanceOf(AppError)
    expect((e as AppError).status).toBe(status)
    if (code) expect((e as AppError).code).toBe(code)
    return e as AppError
  }
  throw new Error(`Une AppError ${status} était attendue`)
}

describe('Vente — création', () => {
  it('vente espèces complète : stock décrémenté, facture payée, aucune créance', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 10 }] })

    const { order } = await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'cash', paidAmount: 1500,
      items: [{ productVariantId: p.variantId, quantity: 3, unitPrice: 500 }],
    })

    expect(order.order_number).toBe('VNT-000001')
    expect(await stockOf(t.depotId, p.variantId)).toBe(7)
    const credits = await sql`SELECT 1 FROM credit_notes WHERE sales_order_id = ${order.id}`
    expect(credits).toHaveLength(0)
    const [invoice] = await sql`SELECT status, total_amount FROM invoices WHERE order_id = ${order.id}`
    expect(invoice.status).toBe('paid')
    expect(Number(invoice.total_amount)).toBe(1500)
    expect(await balanceOf(t.clientId, 'product')).toBe(0)
  })

  it('refuse une vente « Espèces » partiellement payée (plus de dette fictive)', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 10 }] })
    await expectAppError(
      createSale({
        companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
        paymentMethod: 'cash', paidAmount: 0,
        items: [{ productVariantId: p.variantId, quantity: 1, unitPrice: 500 }],
      }),
      400,
      'INCOMPLETE_PAYMENT'
    )
    expect(await stockOf(t.depotId, p.variantId)).toBe(10)
  })

  it('vente à crédit : créance numérotée par entreprise et dette sur le compte client', async () => {
    const a = await createTenant('A')
    const b = await createTenant('B')
    const pa = await createProduct(a.companyId, a.depotId, { lots: [{ lot: null, qty: 5 }] })
    const pb = await createProduct(b.companyId, b.depotId, { lots: [{ lot: null, qty: 5 }] })

    const base = { paymentMethod: 'credit' as const, paidAmount: 0 }
    const sa = await createSale({ ...base, companyId: a.companyId, userId: a.userId, clientId: a.clientId, depotId: a.depotId, items: [{ productVariantId: pa.variantId, quantity: 2, unitPrice: 500 }] })
    const sb = await createSale({ ...base, companyId: b.companyId, userId: b.userId, clientId: b.clientId, depotId: b.depotId, items: [{ productVariantId: pb.variantId, quantity: 2, unitPrice: 500 }] })

    const [ca] = await sql`SELECT credit_number, status FROM credit_notes WHERE sales_order_id = ${sa.order.id}`
    const [cb] = await sql`SELECT credit_number FROM credit_notes WHERE sales_order_id = ${sb.order.id}`
    // Avant : le 2e tenant échouait (CR-00001 unique sur toute la plateforme)
    expect(ca.credit_number).toBe('CR-00001')
    expect(cb.credit_number).toBe('CR-00001')
    expect(ca.status).toBe('pending')
    expect(await balanceOf(a.clientId, 'product')).toBe(-1000)
  })

  it('sortie FEFO sur plusieurs lots, sans double décrément', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, {
      lots: [
        { lot: 'L-TARD', qty: 5, expiry: '2030-01-01' },
        { lot: 'L-TOT', qty: 3, expiry: '2027-01-01' },
      ],
    })
    await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'cash', paidAmount: 2000,
      items: [{ productVariantId: p.variantId, quantity: 4, unitPrice: 500 }],
    })
    const lots = await sql`
      SELECT lot_number, quantity FROM stock WHERE product_variant_id = ${p.variantId} ORDER BY lot_number
    `
    expect(lots.map((l) => [l.lot_number, l.quantity])).toEqual([
      ['L-TARD', 4],
      ['L-TOT', 0],
    ])
    const [mv] = await sql`
      SELECT COALESCE(SUM(quantity), 0)::int AS q FROM stock_movements WHERE product_variant_id = ${p.variantId}
    `
    expect(mv.q).toBe(-4)
  })

  it('stock insuffisant : erreur claire et aucune écriture', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 2 }] })
    const err = await expectAppError(
      createSale({
        companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
        paymentMethod: 'cash', paidAmount: 1500,
        items: [{ productVariantId: p.variantId, quantity: 3, unitPrice: 500 }],
      }),
      409,
      'INSUFFICIENT_STOCK'
    )
    expect(err.message).toContain('Bière 65cl')
    const orders = await sql`SELECT 1 FROM sales_orders WHERE company_id = ${t.companyId}`
    expect(orders).toHaveLength(0)
    expect(await stockOf(t.depotId, p.variantId)).toBe(2)
  })

  it('concurrence : 10 ventes simultanées sur 5 unités → 5 réussites, stock à 0', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 5 }] })
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        createSale({
          companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
          paymentMethod: 'cash', paidAmount: 500,
          items: [{ productVariantId: p.variantId, quantity: 1, unitPrice: 500 }],
        })
      )
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5)
    expect(await stockOf(t.depotId, p.variantId)).toBe(0)
    const numbers = await sql`SELECT order_number FROM sales_orders WHERE company_id = ${t.companyId}`
    expect(new Set(numbers.map((n) => n.order_number)).size).toBe(5)
  })

  it('isolation : impossible de vendre le stock d’une autre entreprise', async () => {
    const a = await createTenant('A')
    const b = await createTenant('B')
    const pb = await createProduct(b.companyId, b.depotId, { lots: [{ lot: null, qty: 5 }] })
    await expectAppError(
      createSale({
        companyId: a.companyId, userId: a.userId, clientId: a.clientId, depotId: b.depotId,
        paymentMethod: 'cash', paidAmount: 500,
        items: [{ productVariantId: pb.variantId, quantity: 1, unitPrice: 500 }],
      }),
      404
    )
    expect(await stockOf(b.depotId, pb.variantId)).toBe(5)
  })

  it('plafond de crédit appliqué, quel que soit le mode de paiement', async () => {
    const t = await createTenant()
    await sql`UPDATE clients SET credit_limit = 800 WHERE id = ${t.clientId}`
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 10 }] })
    await expectAppError(
      createSale({
        companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
        paymentMethod: 'mixed', paidAmount: 100,
        items: [{ productVariantId: p.variantId, quantity: 2, unitPrice: 500 }],
      }),
      409,
      'CREDIT_LIMIT'
    )
  })
})

describe('Vente — statuts et annulation', () => {
  it('annulation : stock réintégré, dette effacée, créance et facture annulées', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: 'L1', qty: 10 }] })
    const { order } = await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'credit', paidAmount: 0,
      items: [{ productVariantId: p.variantId, quantity: 4, unitPrice: 500 }],
    })
    expect(await stockOf(t.depotId, p.variantId)).toBe(6)

    await changeSaleStatus({ companyId: t.companyId, userId: t.userId, orderId: order.id as string, status: 'cancelled' })

    expect(await stockOf(t.depotId, p.variantId)).toBe(10)
    expect(await balanceOf(t.clientId, 'product')).toBe(0)
    const [credit] = await sql`SELECT status FROM credit_notes WHERE sales_order_id = ${order.id}`
    expect(credit.status).toBe('written_off')
    const [invoice] = await sql`SELECT status FROM invoices WHERE order_id = ${order.id}`
    expect(invoice.status).toBe('cancelled')
  })

  it('transitions interdites (retour en arrière, réouverture d’une vente annulée)', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 10 }] })
    const { order } = await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'cash', paidAmount: 500,
      items: [{ productVariantId: p.variantId, quantity: 1, unitPrice: 500 }],
    })
    const id = order.id as string
    await changeSaleStatus({ companyId: t.companyId, userId: t.userId, orderId: id, status: 'delivered' })
    await expectAppError(
      changeSaleStatus({ companyId: t.companyId, userId: t.userId, orderId: id, status: 'confirmed' }),
      409,
      'INVALID_TRANSITION'
    )
    await expectAppError(
      changeSaleStatus({ companyId: t.companyId, userId: t.userId, orderId: id, status: 'cancelled' }),
      409,
      'INVALID_TRANSITION'
    )
  })

  it('une entreprise ne peut pas modifier la vente d’une autre', async () => {
    const a = await createTenant('A')
    const b = await createTenant('B')
    const pb = await createProduct(b.companyId, b.depotId, { lots: [{ lot: null, qty: 5 }] })
    const { order } = await createSale({
      companyId: b.companyId, userId: b.userId, clientId: b.clientId, depotId: b.depotId,
      paymentMethod: 'cash', paidAmount: 500,
      items: [{ productVariantId: pb.variantId, quantity: 1, unitPrice: 500 }],
    })
    await expectAppError(
      changeSaleStatus({ companyId: a.companyId, userId: a.userId, orderId: order.id as string, status: 'cancelled' }),
      404
    )
  })
})
