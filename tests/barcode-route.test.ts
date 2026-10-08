import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { actAs, json, req } from './route-helpers'
import { sql } from '@/lib/db'
import { createProduct, createTenant } from './helpers'
import * as barcode from '@/app/api/products/barcode/[code]/route'

const codeParams = (code: string) => ({ params: Promise.resolve({ code }) })
const url = (code: string, qs = '') => `http://localhost/api/products/barcode/${encodeURIComponent(code)}${qs}`

async function withBarcode(variantId: string, code: string) {
  await sql`UPDATE product_variants SET barcode = ${code} WHERE id = ${variantId}`
}

/** Code unique par test (la base de test est partagée entre les exécutions). */
function uniqueCode(prefix = '611') {
  return `${prefix}${Math.random().toString().slice(2, 12).padEnd(10, '0')}`
}

describe('GET /api/products/barcode/[code]', () => {
  it('trouve la variante de l’entreprise, avec le stock du dépôt demandé', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, { price: 650, lots: [{ lot: null, qty: 7 }] })
    const code = uniqueCode()
    await withBarcode(p.variantId, code)
    actAs(t)

    const res = await json(await barcode.GET(new NextRequest(url(code, `?depotId=${t.depotId}`)), codeParams(code)))
    expect(res.status).toBe(200)
    expect(res.body.data.variant_id).toBe(p.variantId)
    expect(res.body.data.product_id).toBe(p.productId)
    expect(res.body.data.price).toBe(650)
    expect(res.body.data.stock).toBe(7)
  })

  it('isolation : le code-barres d’une autre entreprise est inconnu', async () => {
    const a = await createTenant('A')
    const b = await createTenant('B')
    const p = await createProduct(b.companyId, b.depotId)
    const code = uniqueCode()
    await withBarcode(p.variantId, code)

    actAs(a)
    const res = await json(await barcode.GET(new NextRequest(url(code)), codeParams(code)))
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('BARCODE_UNKNOWN')
    expect(JSON.stringify(res.body)).not.toContain(p.variantId)
  })

  it('isolation : le stock d’un dépôt d’une autre entreprise n’est pas exposé', async () => {
    const a = await createTenant('A')
    const b = await createTenant('B')
    const p = await createProduct(a.companyId, a.depotId)
    await sql`
      INSERT INTO stock (depot_id, product_variant_id, lot_number, quantity) VALUES (${b.depotId}, ${p.variantId}, NULL, 99)
    `
    const code = uniqueCode()
    await withBarcode(p.variantId, code)
    actAs(a)
    const res = await json(await barcode.GET(new NextRequest(url(code, `?depotId=${b.depotId}`)), codeParams(code)))
    expect(res.status).toBe(200)
    expect(res.body.data.stock).toBe(0)
  })

  it('code inconnu : 404 explicite avec proposition d’association', async () => {
    const t = await createTenant()
    actAs(t)
    const code = uniqueCode('999')
    const res = await json(await barcode.GET(new NextRequest(url(code)), codeParams(code)))
    expect(res.status).toBe(404)
    expect(res.body.error).toContain(code)
    expect(res.body.details).toEqual({ code, canAssign: true })
  })

  it('UPC-A lu comme EAN-13 (zéro en tête) : même produit', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId)
    const upc = '036000291452'
    await withBarcode(p.variantId, upc)
    actAs(t)
    const res = await json(await barcode.GET(new NextRequest(url(`0${upc}`)), codeParams(`0${upc}`)))
    expect(res.status).toBe(200)
    expect(res.body.data.variant_id).toBe(p.variantId)
  })

  it('code vide ou trop long : 400', async () => {
    const t = await createTenant()
    actAs(t)
    const res = await barcode.GET(new NextRequest(url('x')), codeParams('   '))
    expect(res.status).toBe(400)
    const long = 'A'.repeat(101)
    expect((await barcode.GET(new NextRequest(url(long)), codeParams(long))).status).toBe(400)
  })
})

describe('POST / DELETE /api/products/barcode/[code]', () => {
  it('associe un code à une variante, puis le retire', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId)
    const code = uniqueCode()
    actAs(t)

    const post = await json(await barcode.POST(req('POST', { variantId: p.variantId }, url(code)), codeParams(code)))
    expect(post.status).toBe(200)
    expect(post.body.data.variant_id).toBe(p.variantId)
    const [row] = await sql`SELECT barcode FROM product_variants WHERE id = ${p.variantId}`
    expect(row.barcode).toBe(code)

    const del = await barcode.DELETE(new NextRequest(url(code, `?variantId=${p.variantId}`), { method: 'DELETE' }), codeParams(code))
    expect(del.status).toBe(200)
    const [after] = await sql`SELECT barcode FROM product_variants WHERE id = ${p.variantId}`
    expect(after.barcode).toBeNull()
  })

  it('refuse un code déjà porté par une autre variante de l’entreprise', async () => {
    const t = await createTenant()
    const p1 = await createProduct(t.companyId, t.depotId)
    const p2 = await createProduct(t.companyId, t.depotId)
    const code = uniqueCode()
    await withBarcode(p1.variantId, code)
    actAs(t)
    const res = await json(await barcode.POST(req('POST', { variantId: p2.variantId }, url(code)), codeParams(code)))
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('BARCODE_TAKEN')
  })

  it('isolation : impossible d’associer ou de retirer le code d’une variante d’une autre entreprise', async () => {
    const a = await createTenant('A')
    const b = await createTenant('B')
    const pb = await createProduct(b.companyId, b.depotId)
    const code = uniqueCode()
    await withBarcode(pb.variantId, code)
    actAs(a)

    const post = await barcode.POST(req('POST', { variantId: pb.variantId }, url(`${code}9`)), codeParams(`${code}9`))
    expect(post.status).toBe(404)
    const del = await barcode.DELETE(new NextRequest(url(code, `?variantId=${pb.variantId}`), { method: 'DELETE' }), codeParams(code))
    expect(del.status).toBe(404)
    const [row] = await sql`SELECT barcode FROM product_variants WHERE id = ${pb.variantId}`
    expect(row.barcode).toBe(code)
  })

  it('le même code peut exister dans deux entreprises différentes', async () => {
    const a = await createTenant('A')
    const b = await createTenant('B')
    const pa = await createProduct(a.companyId, a.depotId)
    const pb = await createProduct(b.companyId, b.depotId)
    const code = uniqueCode()
    await withBarcode(pb.variantId, code)
    actAs(a)
    const res = await barcode.POST(req('POST', { variantId: pa.variantId }, url(code)), codeParams(code))
    expect(res.status).toBe(200)
  })
})
