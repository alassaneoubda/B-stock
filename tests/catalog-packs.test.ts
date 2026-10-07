import { describe, expect, it } from 'vitest'
import { actAs, json, req } from './route-helpers'
import { sql, withTransaction } from '@/lib/db'
import { addStock } from '@/lib/domain/stock'
import { createSale } from '@/lib/domain/sales'
import { createTenant } from './helpers'
import * as catalog from '@/app/api/products/catalog/route'
import * as products from '@/app/api/products/route'

const bock = (variations: unknown[]) => ({
  items: [{ key: 'BOCK', name: 'Bock', brand: 'Solibra', category: 'Bières', variations }],
})
const bock66 = {
  sku: 'BOCK-66-C12', volume: '66 cl', packKind: 'Casier', unitsPerPack: 12,
  contentUnit: 'bouteilles', purchasePrice: 7200, sellingPrice: 8400,
}
const bock100 = {
  sku: 'BOCK-100-C6', volume: '100 cl', packKind: 'Casier', unitsPerPack: 6,
  contentUnit: 'bouteilles', purchasePrice: 5400, sellingPrice: 6300,
}

async function variantsOf(companyId: string, sku: string) {
  return sql`
    SELECT p.name, p.base_unit, pv.id, pv.sku, pv.price::float AS price, pv.cost_price::float AS cost,
           pt.name AS label, pt.description, pt.units_per_case, pt.is_returnable,
           (SELECT count(*)::int FROM packaging_stock ps WHERE ps.packaging_type_id = pt.id) AS depots
    FROM products p
    JOIN product_variants pv ON pv.product_id = p.id
    JOIN packaging_types pt ON pt.id = pv.packaging_type_id
    WHERE p.company_id = ${companyId} AND p.sku = ${sku}
    ORDER BY pt.units_per_case DESC
  `
}

describe('Catalogue par conditionnement', () => {
  it('un produit, un format par variante, contenu propre à chaque format et prix au casier', async () => {
    const t = await createTenant()
    actAs(t)
    const res = await json(await catalog.POST(req('POST', bock([bock66, bock100]))))
    expect(res.status).toBe(200)
    expect(res.body.created).toBe(2)

    const rows = await variantsOf(t.companyId, 'BOCK')
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.name))).toEqual(new Set(['Bock'])) // un seul produit
    expect(rows[0]).toMatchObject({
      base_unit: 'casier', sku: 'BOCK-66-C12', label: '66 cl · Casier de 12',
      description: 'Casier de 12 bouteilles de 66 cl', units_per_case: 12,
      price: 8400, cost: 7200, is_returnable: true, depots: 1,
    })
    expect(rows[1]).toMatchObject({
      sku: 'BOCK-100-C6', label: '100 cl · Casier de 6', units_per_case: 6, price: 6300, cost: 5400,
    })
  })

  it('rejouable : formats existants ignorés, format manquant ajouté au même produit', async () => {
    const t = await createTenant()
    actAs(t)
    await catalog.POST(req('POST', bock([bock66])))

    const again = await json(await catalog.POST(req('POST', bock([bock66]))))
    expect(again.status).toBe(409)
    expect(again.body.skipped).toEqual(['Bock 66 cl · Casier de 12'])

    const more = await json(await catalog.POST(req('POST', bock([
      bock66,
      bock100,
      // format ajouté par le dépôt (absent du catalogue), contenu libre
      { ...bock66, sku: null, volume: '33 cl', unitsPerPack: 30 },
    ]))))
    expect(more.status).toBe(200)
    expect(more.body.created).toBe(2)
    expect(more.body.skipped).toHaveLength(1)

    const rows = await variantsOf(t.companyId, 'BOCK')
    expect(rows.map((r) => r.units_per_case)).toEqual([30, 12, 6])
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM products WHERE company_id = ${t.companyId}`
    expect(n).toBe(1)
  })

  it('pack et carton : non consignés', async () => {
    const t = await createTenant()
    actAs(t)
    const res = await json(await catalog.POST(req('POST', {
      items: [{ key: 'AWA', name: 'Awa', brand: 'Awa', category: 'Eaux minérales', variations: [{
        sku: 'AWA-15-P6', volume: '1,5 L', packKind: 'Pack', unitsPerPack: 6,
        contentUnit: 'bouteilles', purchasePrice: 1500, sellingPrice: 1800,
      }] }],
    })))
    expect(res.status).toBe(200)
    const [row] = await variantsOf(t.companyId, 'AWA')
    expect(row).toMatchObject({ base_unit: 'pack', label: '1,5 L · Pack de 6', is_returnable: false })
  })

  it('refuse un contenu invalide ou un format inconnu', async () => {
    const t = await createTenant()
    actAs(t)
    const zero = await json(await catalog.POST(req('POST', bock([{ ...bock66, unitsPerPack: 0 }]))))
    expect(zero.status).toBe(400)
    const unknown = await json(await catalog.POST(req('POST', bock([{ ...bock66, sku: 'BOCK-XX' }]))))
    expect(unknown.status).toBe(400)
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM products WHERE company_id = ${t.companyId}`
    expect(n).toBe(0)
  })

  it('le stock et les ventes se comptent en casiers', async () => {
    const t = await createTenant()
    actAs(t)
    await catalog.POST(req('POST', bock([bock100])))
    const [variant] = await variantsOf(t.companyId, 'BOCK')

    await withTransaction((tx) =>
      addStock(tx, { companyId: t.companyId, depotId: t.depotId, variantId: variant.id, quantity: 10, movementType: 'purchase' })
    )
    const { order } = await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'cash', paidAmount: 12600,
      items: [{ productVariantId: variant.id, quantity: 2, unitPrice: 6300 }],
    })
    expect(Number(order.subtotal)).toBe(12600) // 2 casiers × prix du casier
    const [{ qty }] = await sql`
      SELECT COALESCE(SUM(quantity), 0)::int AS qty FROM stock WHERE product_variant_id = ${variant.id}
    `
    expect(qty).toBe(8)
  })

  it('création manuelle : le contenu du casier est celui saisi', async () => {
    const t = await createTenant()
    actAs(t)
    const res = await json(await products.POST(req('POST', {
      name: 'Bière locale', sku: 'LOC-1', baseUnit: 'casier', unitsPerPack: 20,
      purchasePrice: 6000, sellingPrice: 7000,
    })))
    expect(res.status).toBe(201)
    const [row] = await variantsOf(t.companyId, 'LOC-1')
    expect(row).toMatchObject({ label: 'Casier de 20', units_per_case: 20, price: 7000, cost: 6000 })
  })
})
