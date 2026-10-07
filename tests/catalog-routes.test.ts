import { describe, expect, it } from 'vitest'
import { actAs, json, params, req } from './route-helpers'
import { sql } from '@/lib/db'
import { createSale } from '@/lib/domain/sales'
import { toCSV } from '@/lib/csv'
import { createProduct, createTenant } from './helpers'
import * as deliveries from '@/app/api/deliveries/route'
import * as delivery from '@/app/api/deliveries/[id]/route'
import * as stops from '@/app/api/deliveries/[id]/stops/route'
import * as exportPdf from '@/app/api/export/pdf/route'
import * as product from '@/app/api/products/[id]/route'

async function newTour(t: { companyId: string; userId: string; depotId: string }) {
  actAs(t)
  const res = await json(await deliveries.POST(req('POST', {
    tourDate: '2026-10-06', driverName: 'Konan', depotId: t.depotId,
  })))
  expect(res.status).toBeLessThan(300)
  return res.body.data.id as string
}

describe('Tournées de livraison', () => {
  it('fuite corrigée : impossible d’ajouter le client d’une autre entreprise à une tournée', async () => {
    const a = await createTenant('A')
    const b = await createTenant('B')
    await sql`UPDATE clients SET phone = '0700000000', address = 'Cocody' WHERE id = ${b.clientId}`
    const tourId = await newTour(a)

    const res = await json(await stops.POST(req('POST', { clientId: b.clientId, stopOrder: 1 }), params(tourId)))
    expect(res.status).toBe(404)

    const detail = await json(await delivery.GET(req('GET'), params(tourId)))
    expect(JSON.stringify(detail.body)).not.toContain('0700000000')
  })

  it('transitions contrôlées et arrêt livré → commande livrée', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 5 }] })
    const { order } = await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'cash', paidAmount: 500,
      items: [{ productVariantId: p.variantId, quantity: 1, unitPrice: 500 }],
    })
    const tourId = await newTour(t)
    const stop = await json(await stops.POST(
      req('POST', { clientId: t.clientId, salesOrderId: order.id, stopOrder: 1 }), params(tourId)
    ))
    expect(stop.status).toBe(201)

    const back = await json(await delivery.PATCH(req('PATCH', { status: 'completed' }), params(tourId)))
    expect(back.status).toBe(409) // planned → completed interdit

    await delivery.PATCH(req('PATCH', { status: 'in_progress' }), params(tourId))
    await stops.PATCH(req('PATCH', { stopId: stop.body.data.id, status: 'delivered' }), params(tourId))
    const [so] = await sql`SELECT status FROM sales_orders WHERE id = ${order.id}`
    expect(so.status).toBe('delivered')

    await delivery.PATCH(req('PATCH', { status: 'completed' }), params(tourId))
    const reopen = await json(await delivery.PATCH(req('PATCH', { status: 'planned' }), params(tourId)))
    expect(reopen.status).toBe(409)
  })
})

describe('Export PDF', () => {
  it('XSS stockée neutralisée : les noms sont échappés', async () => {
    const t = await createTenant()
    actAs(t)
    await sql`UPDATE clients SET name = '<script>alert(1)</script>' WHERE id = ${t.clientId}`
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 5 }] })
    const { order } = await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'cash', paidAmount: 500,
      items: [{ productVariantId: p.variantId, quantity: 1, unitPrice: 500 }],
    })
    const res = await exportPdf.GET(req('GET', undefined, `http://localhost/api/export/pdf?type=invoice&id=${order.id}`))
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(res.headers.get('content-security-policy')).toContain("script-src 'none'")
  })

  it('le document d’une autre entreprise est introuvable', async () => {
    const a = await createTenant('A')
    const b = await createTenant('B')
    const p = await createProduct(b.companyId, b.depotId, { lots: [{ lot: null, qty: 5 }] })
    const { order } = await createSale({
      companyId: b.companyId, userId: b.userId, clientId: b.clientId, depotId: b.depotId,
      paymentMethod: 'cash', paidAmount: 500,
      items: [{ productVariantId: p.variantId, quantity: 1, unitPrice: 500 }],
    })
    actAs(a)
    const res = await exportPdf.GET(req('GET', undefined, `http://localhost/api/export/pdf?type=invoice&id=${order.id}`))
    expect(res.status).toBe(404)
  })
})

describe('Produits et CSV', () => {
  it('un produit déjà vendu est désactivé au lieu de casser sur la clé étrangère', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 5 }] })
    await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'cash', paidAmount: 500,
      items: [{ productVariantId: p.variantId, quantity: 1, unitPrice: 500 }],
    })
    actAs(t)
    const res = await json(await product.DELETE(req('DELETE'), params(p.productId)))
    expect(res.status).toBe(200)
    expect(res.body.softDeleted).toBe(true)
    const [row] = await sql`SELECT is_active FROM products WHERE id = ${p.productId}`
    expect(row.is_active).toBe(false)
  })

  it('injection CSV neutralisée', () => {
    const csv = toCSV([{ name: '=HYPERLINK("http://evil")', amount: -1500.5 }])
    expect(csv).toContain(`'=HYPERLINK`)
    expect(csv).toContain('-1500.5')
  })
})
