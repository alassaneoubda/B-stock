import { describe, expect, it } from 'vitest'
import { actAs, json, params, req } from './route-helpers'
import { sql } from '@/lib/db'
import { createSale } from '@/lib/domain/sales'
import { balanceOf, createProduct, createTenant, stockOf } from './helpers'
import * as clientPayments from '@/app/api/clients/[id]/payments/route'
import * as creditPay from '@/app/api/credits/[id]/pay/route'
import * as cash from '@/app/api/cash/route'
import * as cashClose from '@/app/api/cash/close/route'
import * as cashMovements from '@/app/api/cash/movements/route'
import * as returns from '@/app/api/returns/route'
import * as returnProcess from '@/app/api/returns/[id]/process/route'

/** Entreprise avec une vente à crédit de 2 000 FCFA (4 × 500). */
async function tenantWithCreditSale() {
  const t = await createTenant()
  const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 20 }] })
  const { order } = await createSale({
    companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
    paymentMethod: 'credit', paidAmount: 0,
    items: [{ productVariantId: p.variantId, quantity: 4, unitPrice: 500 }],
  })
  actAs(t)
  const [credit] = await sql`SELECT id FROM credit_notes WHERE sales_order_id = ${order.id}`
  return { ...t, ...p, orderId: order.id as string, creditId: credit.id as string }
}

describe('Encaissements : un seul service, des agrégats cohérents', () => {
  it('règlement partiel : créance, vente, facture et solde client mis à jour ensemble', async () => {
    const t = await tenantWithCreditSale()
    const res = await json(await clientPayments.POST(
      req('POST', { amount: 1500, paymentMethod: 'mobile_money' }), params(t.clientId)
    ))
    expect(res.status).toBeLessThan(300)

    const [credit] = await sql`SELECT paid_amount, status FROM credit_notes WHERE id = ${t.creditId}`
    expect(Number(credit.paid_amount)).toBe(1500)
    expect(credit.status).toBe('partial')
    const [order] = await sql`SELECT paid_amount, paid_amount_products FROM sales_orders WHERE id = ${t.orderId}`
    expect(Number(order.paid_amount)).toBe(1500)
    expect(Number(order.paid_amount_products)).toBe(1500)
    const [invoice] = await sql`SELECT amount_paid, remaining_amount, status FROM invoices WHERE order_id = ${t.orderId}`
    expect(Number(invoice.remaining_amount)).toBe(500)
    expect(invoice.status).toBe('partial')
    expect(await balanceOf(t.clientId, 'product')).toBe(-500)
  })

  it('montant supérieur à la dette refusé', async () => {
    const t = await tenantWithCreditSale()
    const res = await json(await creditPay.POST(req('POST', { amount: 5000 }), params(t.creditId)))
    expect(res.status).toBe(409)
    expect(await balanceOf(t.clientId, 'product')).toBe(-2000)
  })

  it('concurrence : deux règlements simultanés de toute la dette → un seul passe', async () => {
    const t = await tenantWithCreditSale()
    const results = await Promise.all([
      creditPay.POST(req('POST', { amount: 2000 }), params(t.creditId)),
      creditPay.POST(req('POST', { amount: 2000 }), params(t.creditId)),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    const [credit] = await sql`SELECT paid_amount, status FROM credit_notes WHERE id = ${t.creditId}`
    expect(Number(credit.paid_amount)).toBe(2000)
    expect(credit.status).toBe('paid')
    expect(await balanceOf(t.clientId, 'product')).toBe(0)
  })
})

describe('Caisse', () => {
  it('une seule caisse ouverte, même avec deux ouvertures simultanées', async () => {
    const t = await createTenant()
    actAs(t)
    const results = await Promise.all([
      cash.POST(req('POST', { opening_amount: 10000 })),
      cash.POST(req('POST', { opening_amount: 10000 })),
    ])
    expect(results.filter((r) => r.status < 300)).toHaveLength(1)
    const open = await sql`SELECT 1 FROM cash_sessions WHERE company_id = ${t.companyId} AND status = 'open'`
    expect(open).toHaveLength(1)
  })

  it('clôture : ventes espèces comptées, saisie manuelle non validée exclue, écart juste', async () => {
    const t = await createTenant()
    actAs(t)
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 10 }] })
    await cash.POST(req('POST', { opening_amount: 10000 }))
    await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'cash', paidAmount: 1500,
      items: [{ productVariantId: p.variantId, quantity: 3, unitPrice: 500 }],
    })
    const manual = await json(await cashMovements.POST(req('POST', {
      movement_type: 'cash_out', category: 'expense', amount: 2000, description: 'Carburant',
    })))
    expect(manual.status).toBeLessThan(300)

    const closed = await json(await cashClose.POST(req('POST', { closing_amount: 11500 })))
    expect(closed.status).toBe(200)
    expect(Number(closed.body.data.expected_amount)).toBe(11500) // 10 000 + 1 500, dépense en attente exclue
    expect(Number(closed.body.data.variance)).toBe(0)
    expect(closed.body.warnings.length).toBeGreaterThan(0)

    const again = await json(await cashClose.POST(req('POST', { closing_amount: 11500 })))
    expect(again.status).toBe(409)
  })
})

describe('Retours', () => {
  it('quantité retournée plafonnée au vendu, prix relu en base, traitement unique', async () => {
    const t = await tenantWithCreditSale()

    const tooMany = await json(await returns.POST(req('POST', {
      return_type: 'client', client_id: t.clientId, sales_order_id: t.orderId, depot_id: t.depotId,
      items: [{ product_variant_id: t.variantId, quantity: 5, unit_price: 1 }],
    })))
    expect(tooMany.status).toBe(409)

    const created = await json(await returns.POST(req('POST', {
      return_type: 'client', client_id: t.clientId, sales_order_id: t.orderId, depot_id: t.depotId,
      items: [{ product_variant_id: t.variantId, quantity: 2, unit_price: 999999 }],
    })))
    expect(created.status).toBe(200)
    expect(Number(created.body.data.total_amount)).toBe(1000) // 2 × 500, pas le prix envoyé

    const processed = await json(await returnProcess.POST(req('POST', { action: 'approve' }), params(created.body.data.id)))
    expect(processed.status).toBe(200)
    expect(await stockOf(t.depotId, t.variantId)).toBe(18) // 20 - 4 vendus + 2 retournés
    expect(await balanceOf(t.clientId, 'product')).toBe(-1000)

    const twice = await json(await returnProcess.POST(req('POST', { action: 'approve' }), params(created.body.data.id)))
    expect(twice.status).toBe(409)
    expect(await stockOf(t.depotId, t.variantId)).toBe(18)
  })

  it('retour fournisseur : la marchandise sort du stock (elle y entrait par erreur)', async () => {
    const t = await createTenant()
    actAs(t)
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 10 }] })
    const [supplier] = await sql`INSERT INTO suppliers (company_id, name) VALUES (${t.companyId}, 'Brassivoire') RETURNING id`
    const created = await json(await returns.POST(req('POST', {
      return_type: 'supplier', supplier_id: supplier.id, depot_id: t.depotId,
      items: [{ product_variant_id: p.variantId, quantity: 3 }],
    })))
    expect(created.status).toBe(200)
    await returnProcess.POST(req('POST', { action: 'approve' }), params(created.body.data.id))
    expect(await stockOf(t.depotId, p.variantId)).toBe(7)
  })
})
