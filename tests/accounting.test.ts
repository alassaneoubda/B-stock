import { describe, expect, it, vi } from 'vitest'
import { actAs, json, params, req } from './route-helpers'
import { sql } from '@/lib/db'
import { changeSaleStatus, createSale } from '@/lib/domain/sales'
import { AppError } from '@/lib/errors'
import { balanceOf, createProduct, createTenant } from './helpers'
import { loadAccountingSettings, loadAccountingSource } from '@/lib/accounting/source'
import { generateEntries, type EntryLine } from '@/lib/accounting/entries'
import { assertPeriodOpen } from '@/lib/accounting/period-lock'
import { buildAccountingExport } from '@/lib/accounting/service'
import * as cash from '@/app/api/cash/route'
import * as expenses from '@/app/api/cash/expenses/route'
import * as clientPayments from '@/app/api/clients/[id]/payments/route'
import * as returns from '@/app/api/returns/route'
import * as returnProcess from '@/app/api/returns/[id]/process/route'
import * as procurement from '@/app/api/procurement/route'
import * as invoices from '@/app/api/invoices/route'
import * as invoiceById from '@/app/api/invoices/[id]/route'
import * as periods from '@/app/api/accounting/periods/route'
import * as exportRoute from '@/app/api/accounting/export/route'
import * as settingsRoute from '@/app/api/accounting/settings/route'
import * as settingsReset from '@/app/api/accounting/settings/reset/route'

vi.mock('@/lib/auth', () => ({ auth: async () => null }))

async function currentPeriod() {
  const [row] = await sql`
    SELECT to_char(date_trunc('month', CURRENT_DATE), 'YYYY-MM-DD') AS "from",
           to_char(CURRENT_DATE, 'YYYY-MM-DD') AS "to",
           to_char(CURRENT_DATE - INTERVAL '1 month', 'YYYY-MM') AS previous,
           to_char(CURRENT_DATE - INTERVAL '1 month', 'YYYY-MM-DD') AS previous_day,
           to_char(CURRENT_DATE, 'YYYY-MM') AS current
  `
  return row as { from: string; to: string; previous: string; previous_day: string; current: string }
}

const total = (lines: EntryLine[], key: 'debit' | 'credit') => Math.round(lines.reduce((s, l) => s + l[key] * 100, 0)) / 100
const net = (lines: EntryLine[], account: string) =>
  Math.round(lines.filter((l) => l.account === account).reduce((s, l) => s + (l.debit - l.credit) * 100, 0)) / 100

/**
 * Un mois réaliste, saisi par les vrais services de B-Stock :
 * vente au comptant, vente à crédit puis encaissement Mobile Money, vente avec
 * consignes, vente mixte, avoir, dépense en espèces, achat réceptionné, vente annulée.
 */
async function realisticMonth() {
  const t = await createTenant('Compta')
  actAs(t)
  const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 100 }] })
  const [pkg] = await sql`
    INSERT INTO packaging_types (company_id, name, deposit_price) VALUES (${t.companyId}, 'Casier 12', 300) RETURNING id
  `
  await sql`INSERT INTO packaging_stock (depot_id, packaging_type_id, quantity) VALUES (${t.depotId}, ${pkg.id}, 50)`
  const opened = await cash.POST(req('POST', { opening_amount: 10000 }))
  expect(opened.status).toBeLessThan(300)

  const base = { companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId }
  // 1. Vente au comptant : 3 × 500
  const cashSale = await createSale({
    ...base, paymentMethod: 'cash', paidAmount: 1500,
    items: [{ productVariantId: p.variantId, quantity: 3, unitPrice: 500 }],
  })
  // 2. Vente à crédit : 4 × 500, puis règlement de 1 500 en Mobile Money
  const creditSale = await createSale({
    ...base, paymentMethod: 'credit', paidAmount: 0,
    items: [{ productVariantId: p.variantId, quantity: 4, unitPrice: 500 }],
  })
  const paid = await clientPayments.POST(req('POST', { amount: 1500, paymentMethod: 'mobile_money' }), params(t.clientId))
  expect(paid.status).toBeLessThan(300)
  // 3. Vente avec consignes : 2 × 500 + 2 casiers consignés à 300, payée en espèces
  const pkgSale = await createSale({
    ...base, paymentMethod: 'cash', paidAmount: 1600,
    items: [{ productVariantId: p.variantId, quantity: 2, unitPrice: 500 }],
    packagingItems: [{ packagingTypeId: pkg.id, quantityOut: 2, quantityIn: 0, unitPrice: 300 }],
  })
  // 4. Vente mixte : 1 000 dont 400 en espèces (le reste en Mobile Money)
  await createSale({
    ...base, paymentMethod: 'mixed', paidAmount: 1000, cashAmount: 400,
    items: [{ productVariantId: p.variantId, quantity: 2, unitPrice: 500 }],
  })
  // 5. Avoir : retour d'une unité de la vente à crédit
  const ret = await json(await returns.POST(req('POST', {
    return_type: 'client', sales_order_id: creditSale.order.id, depot_id: t.depotId, refund_method: 'credit_note',
    items: [{ product_variant_id: p.variantId, quantity: 1 }],
  })))
  expect(ret.status).toBe(200)
  const processed = await returnProcess.POST(req('POST', { action: 'approve' }), params(ret.body.data.id))
  expect(processed.status).toBe(200)
  // 6. Dépense en espèces : carburant 2 000
  const exp = await expenses.POST(req('POST', { category: 'fuel', amount: 2000, description: 'Gasoil' }))
  expect(exp.status).toBe(200)
  // 7. Achat : 10 × 300 réceptionnés
  const [supplier] = await sql`INSERT INTO suppliers (company_id, name) VALUES (${t.companyId}, 'Brassivoire') RETURNING id`
  const po = await json(await procurement.POST(req('POST', {
    supplierId: supplier.id, depotId: t.depotId,
    items: [{ productVariantId: p.variantId, quantityOrdered: 10, unitPrice: 300 }],
  })))
  expect(po.status).toBe(201)
  const [poItem] = await sql`SELECT id FROM purchase_order_items WHERE purchase_order_id = ${po.body.data.id}`
  const rec = await procurement.POST(req('POST', {
    purchaseOrderId: po.body.data.id, items: [{ itemId: poItem.id, quantityReceived: 10, quantityDamaged: 0 }],
  }))
  expect(rec.status).toBe(200)
  // 8. Vente annulée : ignorée
  const cancelled = await createSale({
    ...base, paymentMethod: 'cash', paidAmount: 500,
    items: [{ productVariantId: p.variantId, quantity: 1, unitPrice: 500 }],
  })
  await changeSaleStatus({ companyId: t.companyId, userId: t.userId, orderId: cancelled.order.id as string, status: 'cancelled' })

  return { t, p, pkg, supplierId: supplier.id as string, cashSale, creditSale, pkgSale, cancelled }
}

describe('Export comptable — données réelles B-Stock', () => {
  it('chaque pièce et chaque journal sont équilibrés ; montants conformes aux règles', async () => {
    const m = await realisticMonth()
    const period = await currentPeriod()
    const settings = await loadAccountingSettings(m.t.companyId)
    const source = await loadAccountingSource(m.t.companyId, period.from, period.to)
    const { lines, control } = generateEntries(source, settings)

    expect(control.unbalancedPieces).toEqual([])
    expect(control.totalDebit).toBe(control.totalCredit)
    for (const journal of ['VT', 'AC', 'CA', 'MM', 'OD'] as const) {
      const jl = lines.filter((l) => l.journalKey === journal)
      expect(jl.length, journal).toBeGreaterThan(0)
      expect(total(jl, 'debit'), journal).toBe(total(jl, 'credit'))
    }

    // Ventes : 1 500 + 2 000 + 1 000 + 1 000 de produits ; consignes 600 en 4194
    expect(net(lines, '701')).toBe(-5500)
    expect(net(lines, '4194')).toBe(-600)
    // Avoir 500 en 709
    expect(net(lines, '709')).toBe(500)
    // Caisse : 1 500 + 1 600 + 400 encaissés − 2 000 de carburant
    expect(net(lines, '571')).toBe(1500)
    expect(net(lines, '6053')).toBe(2000)
    // Mobile Money : règlement 1 500 + part non espèces de la vente mixte 600
    expect(net(lines, '5211')).toBe(2100)
    // Achats
    expect(net(lines, '601')).toBe(3000)
    expect(net(lines, '401')).toBe(-3000)
    // 411 = dette réelle du client dans B-Stock (crédit 2 000 − 1 500 réglés − 500 d'avoir = 0)
    expect(net(lines, '411')).toBe(0)
    expect(await balanceOf(m.t.clientId, 'product')).toBe(0)

    // Pièces = numéros des documents B-Stock
    const pieces = new Set(lines.map((l) => l.piece))
    expect(pieces.has(m.cashSale.order.order_number as string)).toBe(true)
    expect([...pieces].some((p) => p.startsWith('AV-'))).toBe(true)
    expect([...pieces].some((p) => p.startsWith('ACH-'))).toBe(true)
    // Auxiliaires
    expect(lines.filter((l) => l.account === '411').every((l) => l.auxiliary === 'CMAQUISTEST')).toBe(true)
    expect(lines.filter((l) => l.account === '401').every((l) => l.auxiliary === 'FBRASSIVOIR')).toBe(true)

    // Vente annulée ignorée, avec la raison
    expect(control.ignored).toContainEqual(
      expect.objectContaining({ number: m.cancelled.order.order_number, reason: expect.stringContaining('annulée') })
    )
    expect(lines.some((l) => l.piece === m.cancelled.order.order_number)).toBe(false)
  })

  it('isolation : une autre entreprise ne voit aucune écriture', async () => {
    await realisticMonth()
    const other = await createTenant('Autre')
    const period = await currentPeriod()
    const r = await buildAccountingExport(other.companyId, { ...period, journals: ['VT', 'AC', 'CA', 'BQ', 'MM', 'OD'] })
    expect(r.lines).toHaveLength(0)
  })

  it('paiement fournisseur (table de la migration 031) exporté en banque', async () => {
    const m = await realisticMonth()
    const period = await currentPeriod()
    const [hasTable] = await sql`SELECT to_regclass('public.supplier_payments') IS NOT NULL AS ok`
    if (!hasTable.ok) return
    const [po] = await sql`SELECT id FROM purchase_orders WHERE company_id = ${m.t.companyId} LIMIT 1`
    await sql`
      INSERT INTO supplier_payments (company_id, supplier_id, purchase_order_id, payment_number, amount, payment_method)
      VALUES (${m.t.companyId}, ${m.supplierId}, ${po.id}, 'RF-000001', 2000, 'bank_transfer')
    `
    await sql`
      INSERT INTO supplier_payments (company_id, supplier_id, purchase_order_id, payment_number, amount, payment_method, status)
      VALUES (${m.t.companyId}, ${m.supplierId}, ${po.id}, 'RF-000002', 500, 'cash', 'cancelled')
    `
    const r = await buildAccountingExport(m.t.companyId, { ...period, journals: ['BQ'] })
    expect(r.lines.map((l) => [l.piece, l.account, l.debit, l.credit])).toEqual([
      ['RF-000001', '401', 2000, 0],
      ['RF-000001', '521', 0, 2000],
    ])
  })

  it('route d’export : CSV UTF-8 avec BOM, séparateur ;, historisé', async () => {
    const m = await realisticMonth()
    actAs(m.t)
    const period = await currentPeriod()
    const res = await exportRoute.GET(
      req('GET', undefined, `http://localhost/api/accounting/export?from=${period.from}&to=${period.to}&format=csv`)
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    expect(res.headers.get('Content-Disposition')).toContain(`ecritures_${period.from}_${period.to}.csv`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('Date;Journal;N° pièce;Compte;Compte auxiliaire;Libellé;Débit;Crédit')
    expect(text).toMatch(/;701;;[^;]*;0,00;1500,00/)
    const logged = await sql`SELECT line_count FROM accounting_exports WHERE company_id = ${m.t.companyId}`
    expect(logged).toHaveLength(1)
    expect(Number(logged[0].line_count)).toBeGreaterThan(0)

    const sage = await exportRoute.GET(
      req('GET', undefined, `http://localhost/api/accounting/export?from=${period.from}&to=${period.to}&format=sage&journals=VT`)
    )
    expect(sage.status).toBe(200)
    const sageText = await sage.text()
    expect(sageText.split('\r\n')[1].startsWith('VT;')).toBe(true)

    const bad = await json(await exportRoute.GET(req('GET', undefined, 'http://localhost/api/accounting/export?from=2026-02-01&to=2026-01-01')))
    expect(bad.status).toBe(400)
  })

  it('plan de comptes : modification appliquée à l’export, puis valeurs SYSCOHADA rétablies', async () => {
    const t = await createTenant()
    actAs(t)
    const saved = await json(await settingsRoute.PUT(req('PUT', {
      accounts: { mobile_money: '5851', sales: '7011' },
      journals: { VT: 'VTE' },
      useAuxiliary: true, clientAuxPrefix: 'CL', supplierAuxPrefix: 'FO',
    })))
    expect(saved.status).toBe(200)
    expect((await loadAccountingSettings(t.companyId)).accounts.mobile_money).toBe('5851')

    const dup = await json(await settingsRoute.PUT(req('PUT', {
      accounts: {}, journals: { VT: 'AC' }, useAuxiliary: true, clientAuxPrefix: 'C', supplierAuxPrefix: 'F',
    })))
    expect(dup.status).toBe(400)
    const badAccount = await json(await settingsRoute.PUT(req('PUT', {
      accounts: { cash: '57A' }, journals: {}, useAuxiliary: true, clientAuxPrefix: 'C', supplierAuxPrefix: 'F',
    })))
    expect(badAccount.status).toBe(400)

    const reset = await settingsReset.POST()
    expect(reset.status).toBe(200)
    const after = await loadAccountingSettings(t.companyId)
    expect(after.accounts.mobile_money).toBe('5211')
    expect(after.journals.VT).toBe('VT')
    expect(after.clientAuxPrefix).toBe('C')
  })
})

describe('Clôture de période', () => {
  it('assertPeriodOpen : refuse un document daté d’un mois clôturé, accepte les autres', async () => {
    const t = await createTenant()
    await sql`INSERT INTO accounting_period_locks (company_id, period_start) VALUES (${t.companyId}, '2026-03-01')`
    await expect(assertPeriodOpen(sql, t.companyId, '2026-03-31')).rejects.toMatchObject({ status: 409, code: 'PERIOD_LOCKED' })
    await expect(assertPeriodOpen(sql, t.companyId, new Date(2026, 2, 15, 12))).rejects.toBeInstanceOf(AppError)
    await expect(assertPeriodOpen(sql, t.companyId, '2026-04-01')).resolves.toBeUndefined()
    await expect(assertPeriodOpen(sql, t.companyId, '2026-02-28')).resolves.toBeUndefined()
    // Une autre entreprise n'est pas concernée
    const other = await createTenant()
    await expect(assertPeriodOpen(sql, other.companyId, '2026-03-15')).resolves.toBeUndefined()
  })

  it('factures, avoirs et dépenses refusés dans un mois clôturé ; acceptés après réouverture', async () => {
    const t = await createTenant()
    actAs(t)
    const p = await createProduct(t.companyId, t.depotId, { lots: [{ lot: null, qty: 20 }] })
    await cash.POST(req('POST', { opening_amount: 5000 }))
    const sale = await createSale({
      companyId: t.companyId, userId: t.userId, clientId: t.clientId, depotId: t.depotId,
      paymentMethod: 'credit', paidAmount: 0, items: [{ productVariantId: p.variantId, quantity: 2, unitPrice: 500 }],
    })
    const manual = await json(await invoices.POST(req('POST', {
      type: 'client', clientId: t.clientId, items: [{ description: 'Location frigo', quantity: 1, unitPrice: 5000, itemType: 'service' }],
    })))
    expect(manual.status).toBe(201)
    const ret = await json(await returns.POST(req('POST', {
      return_type: 'client', sales_order_id: sale.order.id, depot_id: t.depotId, refund_method: 'credit_note',
      items: [{ product_variant_id: p.variantId, quantity: 1 }],
    })))

    // Le mois en cours est clôturé (insertion directe : la route n'autorise que les mois terminés)
    await sql`INSERT INTO accounting_period_locks (company_id, period_start) VALUES (${t.companyId}, date_trunc('month', CURRENT_DATE))`

    const newInvoice = await json(await invoices.POST(req('POST', {
      type: 'client', clientId: t.clientId, items: [{ description: 'X', quantity: 1, unitPrice: 100 }],
    })))
    expect(newInvoice.status).toBe(409)
    expect(newInvoice.body.code).toBe('PERIOD_LOCKED')

    const cancelInvoice = await json(await invoiceById.PATCH(req('PATCH', { status: 'cancelled' }), params(manual.body.data.id)))
    expect(cancelInvoice.status).toBe(409)
    const deleteInvoice = await json(await invoiceById.DELETE(req('DELETE'), params(manual.body.data.id)))
    expect(deleteInvoice.status).toBe(409)
    const [stillThere] = await sql`SELECT status FROM invoices WHERE id = ${manual.body.data.id}`
    expect(stillThere.status).not.toBe('cancelled')

    const avoir = await json(await returnProcess.POST(req('POST', { action: 'approve' }), params(ret.body.data.id)))
    expect(avoir.status).toBe(409)
    const avoirs = await sql`SELECT 1 FROM credit_notes WHERE company_id = ${t.companyId} AND total_amount < 0`
    expect(avoirs).toHaveLength(0)

    const expense = await json(await expenses.POST(req('POST', { category: 'rent', amount: 1000 })))
    expect(expense.status).toBe(409)
    expect(expense.body.code).toBe('PERIOD_LOCKED')

    // Réouverture
    const period = await currentPeriod()
    const unlock = await json(await periods.POST(req('POST', { period: period.current, action: 'unlock' })))
    expect(unlock.status).toBe(200)
    expect((await invoices.POST(req('POST', {
      type: 'client', clientId: t.clientId, items: [{ description: 'X', quantity: 1, unitPrice: 100 }],
    }))).status).toBe(201)
    expect((await returnProcess.POST(req('POST', { action: 'approve' }), params(ret.body.data.id))).status).toBe(200)
    expect((await expenses.POST(req('POST', { category: 'rent', amount: 1000 }))).status).toBe(200)
  })

  it('dépense antidatée dans un mois clôturé refusée', async () => {
    const t = await createTenant()
    actAs(t)
    await cash.POST(req('POST', { opening_amount: 5000 }))
    const period = await currentPeriod()
    const lock = await json(await periods.POST(req('POST', { period: period.previous, action: 'lock', force: true })))
    expect(lock.status).toBe(200)
    const backdated = await json(await expenses.POST(req('POST', { category: 'fuel', amount: 500, expense_date: period.previous_day })))
    expect(backdated.status).toBe(409)
    const today = await json(await expenses.POST(req('POST', { category: 'fuel', amount: 500, expense_date: period.to })))
    expect(today.status).toBe(200)
  })

  it('route des périodes : mois terminé uniquement, export requis sauf confirmation, pas de double clôture', async () => {
    const t = await createTenant()
    actAs(t)
    const period = await currentPeriod()

    const current = await json(await periods.POST(req('POST', { period: period.current, action: 'lock' })))
    expect(current.status).toBe(409)
    expect(current.body.code).toBe('PERIOD_NOT_ENDED')

    const notExported = await json(await periods.POST(req('POST', { period: period.previous, action: 'lock' })))
    expect(notExported.status).toBe(409)
    expect(notExported.body.code).toBe('NOT_EXPORTED')

    // Après un export complet couvrant le mois, la clôture passe sans confirmation
    const [prev] = await sql`
      SELECT to_char(date_trunc('month', CURRENT_DATE - INTERVAL '1 month'), 'YYYY-MM-DD') AS "from",
             to_char(date_trunc('month', CURRENT_DATE) - INTERVAL '1 day', 'YYYY-MM-DD') AS "to"
    `
    const exp = await exportRoute.GET(req('GET', undefined, `http://localhost/api/accounting/export?from=${prev.from}&to=${prev.to}`))
    expect(exp.status).toBe(200)
    const locked = await json(await periods.POST(req('POST', { period: period.previous, action: 'lock' })))
    expect(locked.status).toBe(200)
    const twice = await json(await periods.POST(req('POST', { period: period.previous, action: 'lock' })))
    expect(twice.status).toBe(409)

    const list = await json(await periods.GET())
    const row = list.body.data.find((r: any) => r.period === period.previous)
    expect(row.locked).toBe(true)
    expect(row.exportedAt).toBeTruthy()

    expect((await json(await periods.POST(req('POST', { period: period.previous, action: 'unlock' })))).status).toBe(200)
    expect((await json(await periods.POST(req('POST', { period: period.previous, action: 'unlock' })))).status).toBe(409)
  })
})
