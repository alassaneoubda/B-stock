import { describe, expect, it } from 'vitest'
import { actAs, json, params, req } from './route-helpers'
import { sql } from '@/lib/db'
import { changeSaleStatus, createSale } from '@/lib/domain/sales'
import { getMarginReport, todayIso } from '@/lib/domain/costing'
import { generateAlertsForCompany } from '@/lib/domain/alerts'
import { getVatReport } from '@/lib/domain/vat-report'
import { AppError } from '@/lib/errors'
import { DEFAULT_SETTINGS } from '@/lib/accounting/chart'
import { EMPTY_SOURCE, findUnbalancedPieces, generateEntries } from '@/lib/accounting/entries'
import { catalogPriceTtc, invoiceLineVat, splitTtc, summarizeVat, ttcFromHt, type VatSettings } from '@/lib/vat'
import { balanceOf, createProduct, createTenant, stockOf } from './helpers'
import * as saleReturn from '@/app/api/sales/[id]/return/route'
import * as clientPayments from '@/app/api/clients/[id]/payments/route'
import * as products from '@/app/api/products/route'
import * as invoices from '@/app/api/invoices/route'

const VAT: VatSettings = { enabled: true, standardRate: 18, pricesIncludeTax: true, taxId: 'CI-123' }

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

async function enableVat(companyId: string, opts: { rate?: number; includeTax?: boolean } = {}) {
  await sql`
    UPDATE companies SET vat_enabled = true, vat_rate = ${opts.rate ?? 18},
           vat_prices_include_tax = ${opts.includeTax ?? true}, tax_id = 'CI-0001234A'
    WHERE id = ${companyId}
  `
}

async function lockCurrentMonth(companyId: string) {
  await sql`
    INSERT INTO accounting_period_locks (company_id, period_start)
    VALUES (${companyId}, date_trunc('month', CURRENT_DATE)::date)
    ON CONFLICT DO NOTHING
  `
}

async function openCash(t: { companyId: string; depotId: string; userId: string }) {
  await sql`
    INSERT INTO cash_sessions (company_id, depot_id, opened_by, opening_amount, status)
    VALUES (${t.companyId}, ${t.depotId}, ${t.userId}, 0, 'open')
  `
}

// ---------------------------------------------------------------------------
// Calculs purs
// ---------------------------------------------------------------------------

describe('TVA — calculs (arrondi au franc par ligne)', () => {
  it('décompose un TTC : HT arrondi, TVA = TTC − HT', () => {
    expect(splitTtc(1180, 18)).toEqual({ rate: 18, ht: 1000, vat: 180, ttc: 1180 })
    // 1 500 TTC à 18 % : 1 271,19 → 1 271 HT, 229 TVA
    expect(splitTtc(1500, 18)).toEqual({ rate: 18, ht: 1271, vat: 229, ttc: 1500 })
    expect(splitTtc(1500, 0)).toEqual({ rate: 0, ht: 1500, vat: 0, ttc: 1500 })
    expect(splitTtc(-1180, 18)).toEqual({ rate: 18, ht: -1000, vat: -180, ttc: -1180 })
  })

  it('prix saisis HT : TTC = arrondi(HT × 1,18) ; TTC inchangé sinon', () => {
    expect(ttcFromHt(1000, 18)).toBe(1180)
    expect(ttcFromHt(423, 18)).toBe(499)
    expect(catalogPriceTtc({ ...VAT, pricesIncludeTax: false }, 1000)).toBe(1180)
    expect(catalogPriceTtc({ ...VAT, pricesIncludeTax: false }, 1000, 0)).toBe(1000)
    expect(catalogPriceTtc(VAT, 1000)).toBe(1000)
    expect(catalogPriceTtc({ ...VAT, enabled: false, pricesIncludeTax: false }, 1000)).toBe(1000)
  })

  it('totaux = somme des lignes, récapitulatif par taux', () => {
    const lines = [splitTtc(1500, 18), splitTtc(1500, 18), splitTtc(700, 9), splitTtc(300, 0)]
    const s = summarizeVat(lines)
    expect(s.totalTtc).toBe(4000)
    expect(s.totalHt + s.totalVat).toBe(s.totalTtc)
    expect(s.byRate.map((r) => r.rate)).toEqual([18, 9, 0])
    expect(s.byRate[0]).toEqual({ rate: 18, base: 2542, vat: 458, ttc: 3000 })
  })

  it('facture manuelle : consignes hors TVA, prix saisis HT ou TTC', () => {
    expect(invoiceLineVat(VAT, { itemType: 'packaging', quantity: 2, unitPrice: 300 })).toEqual({ total: 600, split: null })
    expect(invoiceLineVat(VAT, { itemType: 'product', quantity: 2, unitPrice: 590 }).split).toMatchObject({ ht: 1000, vat: 180 })
    expect(invoiceLineVat({ ...VAT, pricesIncludeTax: false }, { itemType: 'service', quantity: 1, unitPrice: 1000 })).toEqual({
      total: 1180,
      split: { rate: 18, ht: 1000, vat: 180, ttc: 1180 },
    })
    expect(invoiceLineVat({ ...VAT, enabled: false }, { itemType: 'product', quantity: 1, unitPrice: 1000 })).toEqual({
      total: 1000,
      split: null,
    })
  })
})

// ---------------------------------------------------------------------------
// Écritures comptables
// ---------------------------------------------------------------------------

describe('TVA — écritures comptables', () => {
  const client = { id: 'c1', name: 'Maquis' }
  const supplier = { id: 's1', name: 'Solibra' }

  it('vente : D 411 TTC / C 701 HT / C 4431 TVA ; avoir et achat avec TVA ; tout équilibré', () => {
    const { lines, control } = generateEntries(
      {
        ...EMPTY_SOURCE,
        sales: [{ id: 's', date: '2026-09-02', orderNumber: 'VNT-1', client, subtotal: 11800, packagingNet: 600, vat: 1800 }],
        clientCredits: [
          { id: 'a', date: '2026-09-03', piece: 'AV-1', client, kind: 'avoir', productAmount: 1180, packagingAmount: 0, productVat: 180 },
        ],
        purchases: [{ id: 'p', date: '2026-09-01', piece: 'ACH-1', supplier, amount: 10000, kind: 'reception', vat: 1800 }],
        manualInvoices: [
          { id: 'i', date: '2026-09-04', piece: 'FAC-9', type: 'client', party: client, productAmount: 1180, packagingAmount: 0, serviceAmount: 1180, vat: 360 },
        ],
      },
      DEFAULT_SETTINGS
    )
    expect(control.balanced).toBe(true)
    expect(findUnbalancedPieces(lines)).toHaveLength(0)

    const sale = lines.filter((l) => l.piece === 'VNT-1')
    expect(sale.find((l) => l.account === '701')?.credit).toBe(10000)
    expect(sale.find((l) => l.account === '4431')?.credit).toBe(1800)
    expect(sale.find((l) => l.account === '4194')?.credit).toBe(600) // consignes : jamais de TVA

    const avoir = lines.filter((l) => l.piece === 'AV-1')
    expect(avoir.find((l) => l.account === '709')?.debit).toBe(1000)
    expect(avoir.find((l) => l.account === '4431')?.debit).toBe(180)

    const purchase = lines.filter((l) => l.piece === 'ACH-1')
    expect(purchase.find((l) => l.account === '601')?.debit).toBe(10000)
    expect(purchase.find((l) => l.account === '4452')?.debit).toBe(1800)
    expect(purchase.find((l) => l.account === '401')?.credit).toBe(11800)

    const manual = lines.filter((l) => l.piece === 'FAC-9')
    expect(manual.find((l) => l.account === '4431')?.credit).toBe(360)
  })

  it('sans TVA : écritures inchangées (aucun compte 4431 / 4452)', () => {
    const { lines, control } = generateEntries(
      {
        ...EMPTY_SOURCE,
        sales: [{ id: 's', date: '2026-09-02', orderNumber: 'VNT-1', client, subtotal: 5000, packagingNet: 0 }],
        purchases: [{ id: 'p', date: '2026-09-01', piece: 'ACH-1', supplier, amount: 3000, kind: 'reception' }],
      },
      DEFAULT_SETTINGS
    )
    expect(control.balanced).toBe(true)
    expect(lines.some((l) => l.account === '4431' || l.account === '4452')).toBe(false)
    expect(lines.find((l) => l.account === '701')?.credit).toBe(5000)
  })
})

// ---------------------------------------------------------------------------
// Ventes, factures, marge, rapport
// ---------------------------------------------------------------------------

describe('TVA — figée sur la vente et la facture', () => {
  it('entreprise non assujettie : aucune colonne TVA écrite (comportement inchangé)', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 10 }] })
    const { order } = await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'cash', paidAmount: 1000,
      items: [{ productVariantId: p.variantId, quantity: 2, unitPrice: 500 }],
    })
    const [item] = await sql`SELECT vat_rate, amount_ht, vat_amount FROM sales_order_items WHERE sales_order_id = ${order.id}`
    expect(item).toEqual({ vat_rate: null, amount_ht: null, vat_amount: null })
    const [inv] = await sql`SELECT total_ht, total_vat, total_amount FROM invoices WHERE order_id = ${order.id}`
    expect(Number(inv.total_ht)).toBe(1000)
    expect(inv.total_vat).toBeNull()
  })

  it('assujettie : HT / TVA / TTC par ligne, totaux = somme des lignes, paiement TTC, marge sur le HT', async () => {
    const t = await createTenant()
    await enableVat(t.companyId)
    const beer = await createProduct(t.companyId, t.depotId, { price: 500, lots: [{ lot: null, qty: 20 }] })
    const water = await createProduct(t.companyId, t.depotId, { price: 300, lots: [{ lot: null, qty: 20 }] })
    await sql`UPDATE products SET vat_rate = 0 WHERE id = ${water.productId}`
    await sql`UPDATE product_variants SET cost_price = 200 WHERE id = ${beer.variantId}`
    const [pkg] = await sql`
      INSERT INTO packaging_types (company_id, name, deposit_price) VALUES (${t.companyId}, 'Casier 12', 300) RETURNING id
    `
    await sql`
      INSERT INTO packaging_stock (depot_id, packaging_type_id, quantity) VALUES (${t.depotId}, ${pkg.id}, 10)
      ON CONFLICT (depot_id, packaging_type_id) DO UPDATE SET quantity = 10
    `

    const { order } = await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'cash', paidAmount: 4500 + 600 + 600,
      items: [
        { productVariantId: beer.variantId, quantity: 3, unitPrice: 500 },
        { productVariantId: beer.variantId, quantity: 6, unitPrice: 500 },
        { productVariantId: water.variantId, quantity: 2, unitPrice: 300 },
      ],
      packagingItems: [{ packagingTypeId: pkg.id, quantityOut: 2, quantityIn: 0, unitPrice: 300 }],
    })

    const items = await sql`
      SELECT quantity, total_price::float AS ttc, vat_rate::float AS rate, amount_ht::float AS ht, vat_amount::float AS vat
      FROM sales_order_items WHERE sales_order_id = ${order.id} ORDER BY total_price
    `
    expect(items).toEqual([
      { quantity: 2, ttc: 600, rate: 0, ht: 600, vat: 0 },
      { quantity: 3, ttc: 1500, rate: 18, ht: 1271, vat: 229 },
      { quantity: 6, ttc: 3000, rate: 18, ht: 2542, vat: 458 },
    ])
    const [so] = await sql`SELECT total_ht::float, total_vat::float, total_amount::float, paid_amount::float FROM sales_orders WHERE id = ${order.id}`
    expect(so).toEqual({ total_ht: 4413, total_vat: 687, total_amount: 5700, paid_amount: 5700 })

    // Facture : TTC = dû (consignes comprises, hors TVA), HT = TTC − TVA
    const [inv] = await sql`SELECT id, total_ht::float, total_vat::float, total_amount::float FROM invoices WHERE order_id = ${order.id}`
    expect(inv).toMatchObject({ total_ht: 5013, total_vat: 687, total_amount: 5700 })
    const invItems = await sql`SELECT item_type, vat_amount FROM invoice_items WHERE invoice_id = ${inv.id}`
    expect(invItems.filter((i) => i.item_type === 'packaging').every((i) => i.vat_amount === null)).toBe(true)
    expect(invItems.filter((i) => i.vat_amount !== null)).toHaveLength(3)

    // Marge : chiffre d'affaires HT (4 413), pas TTC
    const margin = await getMarginReport(t.companyId, { from: todayIso(), to: todayIso() })
    expect(margin.totals.revenue).toBe(4413)

    // Rapport TVA de la période
    const report = await getVatReport(t.companyId, { from: todayIso(), to: todayIso() })
    expect(report.collected.vat).toBe(687)
    expect(report.collected.byRate.find((r) => r.rate === 18)).toEqual({ rate: 18, base: 3813, vat: 687 })

    // Retour direct de 3 bières : TVA collectée diminuée au prorata
    actAs(t)
    const ret = await json(await saleReturn.POST(
      req('POST', { items: [{ productVariantId: beer.variantId, quantity: 3 }] }),
      params(order.id as string)
    ))
    expect(ret.status).toBe(200)
    const after = await getVatReport(t.companyId, { from: todayIso(), to: todayIso() })
    expect(after.collected.vat).toBe(687 - 229)
  })

  it('facture manuelle client d’une entreprise assujettie : TVA par ligne, consignes hors TVA', async () => {
    const t = await createTenant()
    await enableVat(t.companyId)
    actAs(t)
    const res = await json(await invoices.POST(req('POST', {
      type: 'client', clientId: t.clientId,
      items: [
        { description: 'Livraison', quantity: 1, unitPrice: 1180, itemType: 'service' },
        { description: 'Consigne', quantity: 2, unitPrice: 300, itemType: 'packaging' },
      ],
    })))
    expect(res.status).toBe(201)
    expect(Number(res.body.data.total_amount)).toBe(1780)
    expect(Number(res.body.data.total_vat)).toBe(180)
    expect(Number(res.body.data.total_ht)).toBe(1600)
  })
})

// ---------------------------------------------------------------------------
// Clôture comptable
// ---------------------------------------------------------------------------

describe('Mois clôturé : ventes, encaissements, annulations et retours refusés', () => {
  it('vente et encaissement sur un mois ouvert, puis refus 409 PERIOD_LOCKED une fois le mois clôturé', async () => {
    const t = await createTenant()
    actAs(t)
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 20 }] })

    // Mois ouvert : vente à crédit et encaissement OK
    const { order } = await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'credit', paidAmount: 0,
      items: [{ productVariantId: p.variantId, quantity: 4, unitPrice: 500 }],
    })
    const paid = await json(await clientPayments.POST(
      req('POST', { amount: 500, paymentMethod: 'mobile_money' }), params(t.clientId)
    ))
    expect(paid.status).toBeLessThan(300)
    const { order: other } = await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'cash', paidAmount: 500,
      items: [{ productVariantId: p.variantId, quantity: 1, unitPrice: 500 }],
    })

    await lockCurrentMonth(t.companyId)

    await expectAppError(
      createSale({
        companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
        paymentMethod: 'cash', paidAmount: 500,
        items: [{ productVariantId: p.variantId, quantity: 1, unitPrice: 500 }],
      }),
      409,
      'PERIOD_LOCKED'
    )
    const refused = await json(await clientPayments.POST(
      req('POST', { amount: 500, paymentMethod: 'mobile_money' }), params(t.clientId)
    ))
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('PERIOD_LOCKED')

    // Annulation d'une vente datée du mois clôturé
    await expectAppError(
      changeSaleStatus({ companyId: t.companyId, userId: t.userId, orderId: other.id as string, status: 'cancelled' }),
      409,
      'PERIOD_LOCKED'
    )
    // Retour direct
    const ret = await json(await saleReturn.POST(
      req('POST', { items: [{ productVariantId: p.variantId, quantity: 1 }] }), params(order.id as string)
    ))
    expect(ret.status).toBe(409)
    expect(ret.body.code).toBe('PERIOD_LOCKED')

    // Rien n'a bougé
    expect(await stockOf(t.depotId, p.variantId)).toBe(15)
    expect(await balanceOf(t.clientId, 'product')).toBe(-1500)
  })
})

// ---------------------------------------------------------------------------
// Annulation après retour partiel
// ---------------------------------------------------------------------------

describe('Annulation après un retour partiel : pas de double remboursement', () => {
  it('vente payée en espèces, retour direct de 4/10, annulation : 3 000 remboursés (et non 5 000)', async () => {
    const t = await createTenant()
    actAs(t)
    await openCash(t)
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 10 }] })
    const { order } = await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'cash', paidAmount: 5000,
      items: [{ productVariantId: p.variantId, quantity: 10, unitPrice: 500 }],
    })
    const ret = await json(await saleReturn.POST(
      req('POST', { items: [{ productVariantId: p.variantId, quantity: 4 }] }), params(order.id as string)
    ))
    expect(ret.status).toBe(200)
    // Le retour a crédité le client de 2 000 (avoir à son compte)
    expect(await balanceOf(t.clientId, 'product')).toBe(2000)

    const { warnings } = await changeSaleStatus({
      companyId: t.companyId, userId: t.userId, orderId: order.id as string, status: 'cancelled',
    })
    const [refund] = await sql`
      SELECT COALESCE(SUM(amount), 0)::float AS total FROM cash_movements
      WHERE reference_id = ${order.id} AND movement_type = 'cash_out'
    `
    expect(refund.total).toBe(3000)
    // Avoir conservé + espèces = ce que le client avait payé
    expect(await balanceOf(t.clientId, 'product')).toBe(2000)
    expect(await stockOf(t.depotId, p.variantId)).toBe(10)
    expect(warnings.some((w) => w.includes('déjà rendus'))).toBe(true)
  })

  it('vente à crédit partiellement payée : le retour qui a seulement réduit la dette ne diminue pas le remboursement', async () => {
    const t = await createTenant()
    actAs(t)
    await openCash(t)
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 10 }] })
    const { order } = await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'mixed', paidAmount: 2000, cashAmount: 2000,
      items: [{ productVariantId: p.variantId, quantity: 10, unitPrice: 500 }],
    })
    // Retour de 4 (2 000) : imputé sur la dette de 3 000 → dette 1 000, aucun avoir
    await saleReturn.POST(req('POST', { items: [{ productVariantId: p.variantId, quantity: 4 }] }), params(order.id as string))
    expect(await balanceOf(t.clientId, 'product')).toBe(-1000)

    await changeSaleStatus({ companyId: t.companyId, userId: t.userId, orderId: order.id as string, status: 'cancelled' })
    const [refund] = await sql`
      SELECT COALESCE(SUM(amount), 0)::float AS total FROM cash_movements
      WHERE reference_id = ${order.id} AND movement_type = 'cash_out'
    `
    expect(refund.total).toBe(2000)
    expect(await balanceOf(t.clientId, 'product')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Alertes intelligentes
// ---------------------------------------------------------------------------

describe('Alertes intelligentes', () => {
  it('produit dormant (valeur au CMP), écarts de caisse répétés, péremption sous N jours — créées puis résolues', async () => {
    const t = await createTenant()
    const p = await createProduct(t.companyId, t.depotId, {
      lots: [{ lot: 'L1', qty: 12, expiry: new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10) }],
    })
    await sql`UPDATE products SET created_at = NOW() - INTERVAL '60 days' WHERE id = ${p.productId}`
    await sql`
      INSERT INTO stock_costs (depot_id, product_variant_id, avg_cost) VALUES (${t.depotId}, ${p.variantId}, 400)
      ON CONFLICT (depot_id, product_variant_id) DO UPDATE SET avg_cost = 400
    `
    for (const v of [-500, -1500, -200]) {
      await sql`
        INSERT INTO cash_sessions (company_id, depot_id, opened_by, closed_by, opening_amount, variance, status, closed_at)
        VALUES (${t.companyId}, ${t.depotId}, ${t.userId}, ${t.userId}, 0, ${v}, 'closed', NOW() - INTERVAL '2 days')
      `
    }
    // Lot à 45 jours : pas d'alerte de péremption avec le délai par défaut (30 j)
    await generateAlertsForCompany(t.companyId)
    const alerts = async () =>
      sql`SELECT alert_type, reference_type, reference_id, message FROM alerts
          WHERE company_id = ${t.companyId} AND is_resolved = false ORDER BY alert_type`
    let open = await alerts()
    expect(open.map((a) => a.alert_type)).toEqual(['cash_variance', 'dormant_stock'])
    const dormant = open.find((a) => a.alert_type === 'dormant_stock')!
    expect(dormant.reference_id).toBe(p.variantId)
    expect(dormant.message).toMatch(/4\s800 FCFA au coût moyen/u)
    expect(open.find((a) => a.alert_type === 'cash_variance')!.reference_id).toBe(t.userId)

    // Délai de péremption porté à 60 jours (réglage de l'entreprise) : le lot est signalé
    await sql`UPDATE companies SET alert_expiry_days = 60 WHERE id = ${t.companyId}`
    await generateAlertsForCompany(t.companyId)
    open = await alerts()
    expect(open.map((a) => a.alert_type)).toContain('expiry')

    // Une vente récente : le produit n'est plus dormant → alerte résolue
    await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'cash', paidAmount: 500,
      items: [{ productVariantId: p.variantId, quantity: 1, unitPrice: 500 }],
    })
    await generateAlertsForCompany(t.companyId)
    open = await alerts()
    expect(open.map((a) => a.alert_type)).not.toContain('dormant_stock')
  })

  it('moins de 3 manquants sur 14 jours : pas d’alerte d’écart de caisse', async () => {
    const t = await createTenant()
    for (const [v, ago] of [[-500, 2], [-500, 3], [-500, 20], [300, 1]] as const) {
      await sql`
        INSERT INTO cash_sessions (company_id, depot_id, opened_by, closed_by, opening_amount, variance, status, closed_at)
        VALUES (${t.companyId}, ${t.depotId}, ${t.userId}, ${t.userId}, 0, ${v}, 'closed', NOW() - make_interval(days => ${ago}))
      `
    }
    await generateAlertsForCompany(t.companyId)
    const rows = await sql`SELECT 1 FROM alerts WHERE company_id = ${t.companyId} AND alert_type = 'cash_variance'`
    expect(rows).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Codes-barres
// ---------------------------------------------------------------------------

describe('Code-barres unique dans l’entreprise', () => {
  it('création d’un produit avec un code-barres déjà utilisé → 409 BARCODE_TAKEN', async () => {
    const t = await createTenant()
    actAs(t)
    const [pkg] = await sql`INSERT INTO packaging_types (company_id, name) VALUES (${t.companyId}, 'Bouteille') RETURNING id`
    const first = await json(await products.POST(req('POST', {
      name: 'Flag 65cl', baseUnit: 'casier', purchasePrice: 0, sellingPrice: 500,
      variants: [{ packagingTypeId: pkg.id, barcode: '6151100060011', price: 500 }],
    })))
    expect(first.status).toBe(201)
    const dup = await json(await products.POST(req('POST', {
      name: 'Autre', baseUnit: 'casier', purchasePrice: 0, sellingPrice: 500,
      variants: [{ packagingTypeId: pkg.id, barcode: '6151100060011', price: 500 }],
    })))
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe('BARCODE_TAKEN')
    const twice = await json(await products.POST(req('POST', {
      name: 'Deux fois', baseUnit: 'casier', purchasePrice: 0, sellingPrice: 500,
      variants: [
        { packagingTypeId: pkg.id, barcode: '123456', price: 500 },
        { packagingTypeId: pkg.id, barcode: '123456', price: 600 },
      ],
    })))
    expect(twice.status).toBe(409)
    // Rien n'a été créé par les créations refusées
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM products WHERE company_id = ${t.companyId}`
    expect(n).toBe(1)
  })
})
