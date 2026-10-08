import { describe, expect, it } from 'vitest'
import {
  buildAuxiliaryCodes,
  DEFAULT_SETTINGS,
  mergeSettings,
  settingsOverrides,
  slugAuxiliary,
  type AccountingSettings,
} from '@/lib/accounting/chart'
import {
  EMPTY_SOURCE,
  findUnbalancedPieces,
  generateEntries,
  splitMixedPayment,
  treasuryOf,
  type AccountingSource,
  type EntryLine,
} from '@/lib/accounting/entries'
import { BOM, formatAmountFr, toGenericCsv, toSageCsv } from '@/lib/accounting/formats'

const maquis = { id: 'c1', name: 'Maquis Le Baobab' }
const brasserie = { id: 's1', name: 'Brassivoire' }

/** Jeu de données réaliste d'un mois de dépôt de boissons. */
function realisticSource(): AccountingSource {
  return {
    ...EMPTY_SOURCE,
    sales: [
      // Vente au comptant : 3 casiers à 500
      { id: 'v1', date: '2026-09-02', orderNumber: 'VNT-000001', invoiceNumber: 'FC-000001', client: maquis, subtotal: 1500, packagingNet: 0 },
      // Vente à crédit
      { id: 'v2', date: '2026-09-03', orderNumber: 'VNT-000002', client: maquis, subtotal: 2000, packagingNet: 0 },
      // Vente avec consignes : 2 casiers sortis à 300
      { id: 'v3', date: '2026-09-04', orderNumber: 'VNT-000003', client: maquis, subtotal: 1000, packagingNet: 600 },
      // Vides rendus en plus des sorties : déduits du prix
      { id: 'v4', date: '2026-09-05', orderNumber: 'VNT-000004', client: maquis, subtotal: 1000, packagingNet: -300 },
    ],
    receipts: [
      { id: 'p1', date: '2026-09-02', piece: 'VNT-000001', client: maquis, amount: 1500, treasury: 'cash', accountType: 'product', origin: 'sale' },
      // Encaissement ultérieur de la vente à crédit, en Mobile Money
      { id: 'p2', date: '2026-09-20', piece: 'VNT-000002', client: maquis, amount: 1500, treasury: 'mobile_money', accountType: 'product', origin: 'settlement' },
      { id: 'p3', date: '2026-09-04', piece: 'VNT-000003', client: maquis, amount: 1000, treasury: 'cash', accountType: 'product', origin: 'sale' },
      { id: 'p4', date: '2026-09-04', piece: 'VNT-000003', client: maquis, amount: 600, treasury: 'cash', accountType: 'packaging', origin: 'sale' },
      { id: 'p5', date: '2026-09-05', piece: 'VNT-000004', client: maquis, amount: 700, treasury: 'bank', accountType: 'product', origin: 'sale' },
    ],
    clientCredits: [
      // Avoir : retour d'un casier de la vente à crédit
      { id: 'a1', date: '2026-09-10', piece: 'AV-00001', client: maquis, kind: 'avoir', productAmount: 500, packagingAmount: 0 },
      // Retour direct de 1 casier vide consigné
      { id: 'r1', date: '2026-09-12', piece: 'VNT-000003', client: maquis, kind: 'return', productAmount: 0, packagingAmount: 300 },
    ],
    expenses: [{ id: 'e1', date: '2026-09-06', piece: 'DEP-0001', category: 'fuel', amount: 2000, description: 'Gasoil camion' }],
    purchases: [
      { id: 'a1r', date: '2026-09-01', piece: 'ACH-000001', supplier: brasserie, amount: 30000, kind: 'reception' },
      { id: 'a1x', date: '2026-09-08', piece: 'ACH-000001', supplier: brasserie, amount: 3000, kind: 'return' },
    ],
    supplierPayments: [{ id: 'sp1', date: '2026-09-15', piece: 'RF-000001', supplier: brasserie, amount: 20000, treasury: 'bank' }],
    cashMisc: [{ id: 'm1', date: '2026-09-07', piece: 'CAI-1', direction: 'out', category: 'withdrawal', amount: 5000, description: 'Versement banque' }],
    cashVariances: [{ id: 'cs1', date: '2026-09-30', piece: 'CLO-1', variance: -250 }],
  }
}

const sum = (lines: EntryLine[], key: 'debit' | 'credit') => Math.round(lines.reduce((s, l) => s + l[key] * 100, 0)) / 100
const balanceOf = (lines: EntryLine[], account: string) =>
  Math.round(lines.filter((l) => l.account === account).reduce((s, l) => s + (l.debit - l.credit) * 100, 0)) / 100

describe('Écritures SYSCOHADA — équilibre', () => {
  const { lines, control } = generateEntries(realisticSource(), DEFAULT_SETTINGS)

  it('chaque pièce est équilibrée et le contrôle le confirme', () => {
    expect(control.unbalancedPieces).toEqual([])
    expect(findUnbalancedPieces(lines)).toEqual([])
    expect(control.balanced).toBe(true)
    expect(control.totalDebit).toBe(control.totalCredit)
    expect(control.lineCount).toBe(lines.length)
  })

  it('chaque journal est équilibré', () => {
    for (const journal of ['VT', 'AC', 'CA', 'BQ', 'MM', 'OD']) {
      const jl = lines.filter((l) => l.journalKey === journal)
      expect(jl.length, `journal ${journal}`).toBeGreaterThan(0)
      expect(sum(jl, 'debit'), `journal ${journal}`).toBe(sum(jl, 'credit'))
    }
    for (const j of control.byJournal) expect(j.debit).toBe(j.credit)
  })

  it('vente : 701 pour les produits, consignes en 4194 (dette), jamais en chiffre d’affaires', () => {
    const v3 = lines.filter((l) => l.piece === 'VNT-000003' && l.journalKey === 'VT')
    expect(v3.find((l) => l.account === '701')?.credit).toBe(1000)
    expect(v3.find((l) => l.account === '4194')?.credit).toBe(600)
    expect(sum(v3.filter((l) => l.account === '411'), 'debit')).toBe(1600)
    // Vides rendus en plus : 4194 débité, 411 crédité
    const v4 = lines.filter((l) => l.piece === 'VNT-000004' && l.journalKey === 'VT')
    expect(v4.find((l) => l.account === '4194')?.debit).toBe(300)
    expect(v4.find((l) => l.account === '411' && l.credit > 0)?.credit).toBe(300)
    // Total 701 = somme des produits vendus
    expect(-balanceOf(lines, '701')).toBe(5500)
  })

  it('vente à crédit puis encaissement Mobile Money et avoir : le 411 reflète la position du client', () => {
    const mm = lines.filter((l) => l.journalKey === 'MM')
    expect(mm.find((l) => l.account === '5211')?.debit).toBe(1500)
    const od = lines.filter((l) => l.piece === 'AV-00001')
    expect(od.find((l) => l.account === '709')?.debit).toBe(500)
    // 411 : 5800 facturés nets − 5300 encaissés − 500 avoir − 300 vides rendus après la vente
    // = 300 en faveur du client (consigne à lui rembourser)
    expect(balanceOf(lines, '411')).toBe(-300)
    // Consignes : 600 reçues − 300 déduites − 300 remboursées
    expect(balanceOf(lines, '4194')).toBe(0)
  })

  it('caisse : encaissements, dépense carburant, retrait vers banque, manquant de clôture', () => {
    expect(lines.find((l) => l.account === '6053')?.debit).toBe(2000)
    expect(lines.find((l) => l.account === '585')?.debit).toBe(5000)
    expect(lines.find((l) => l.account === '658')?.debit).toBe(250)
    // 571 : 1500 + 1600 encaissés − 2000 − 5000 − 250
    expect(balanceOf(lines, '571')).toBe(-4150)
  })

  it('achats : réception D 601 / C 401, retour inverse, règlement banque', () => {
    expect(balanceOf(lines, '601')).toBe(27000)
    expect(balanceOf(lines, '401')).toBe(-7000)
    expect(lines.filter((l) => l.account === '401').every((l) => l.auxiliary === 'FBRASSIVOIR')).toBe(true)
  })

  it('comptes auxiliaires clients sur toutes les lignes 411', () => {
    expect(lines.filter((l) => l.account === '411').every((l) => l.auxiliary === 'CMAQUISLEBA')).toBe(true)
    expect(lines.filter((l) => l.account === '701').every((l) => l.auxiliary === null)).toBe(true)
  })

  it('filtre de journaux : seuls les journaux demandés sont produits', () => {
    const only = generateEntries(realisticSource(), DEFAULT_SETTINGS, { journals: ['VT'] })
    expect(new Set(only.lines.map((l) => l.journalKey))).toEqual(new Set(['VT']))
    expect(only.control.unbalancedPieces).toEqual([])
  })

  it('plan de comptes et codes journaux personnalisés appliqués', () => {
    const custom: AccountingSettings = {
      ...DEFAULT_SETTINGS,
      accounts: { ...DEFAULT_SETTINGS.accounts, mobile_money: '5851', packaging_clients: '4198' },
      journals: { ...DEFAULT_SETTINGS.journals, VT: 'VTE' },
      useAuxiliary: false,
    }
    const r = generateEntries(realisticSource(), custom)
    expect(r.lines.some((l) => l.account === '5851')).toBe(true)
    expect(r.lines.some((l) => l.account === '4198')).toBe(true)
    expect(r.lines.filter((l) => l.journalKey === 'VT').every((l) => l.journal === 'VTE')).toBe(true)
    expect(r.lines.every((l) => l.auxiliary === null)).toBe(true)
  })

  it('montants non affectés : compte d’attente 471 et alerte', () => {
    const src: AccountingSource = {
      ...EMPTY_SOURCE,
      receipts: [{ id: 'x', date: '2026-09-01', piece: 'ENC-1', client: maquis, amount: 100, treasury: treasuryOf('credit'), accountType: 'product', origin: 'sale' }],
      manualDebts: [{ id: 'd', date: '2026-09-01', piece: 'CR-00009', client: maquis, amount: 800, accountType: 'product' }],
    }
    const r = generateEntries(src, DEFAULT_SETTINGS)
    expect(r.lines.filter((l) => l.account === '471')).toHaveLength(2)
    expect(r.control.warnings.length).toBe(2)
    expect(r.control.unbalancedPieces).toEqual([])
  })

  it('les arrondis ne créent jamais de déséquilibre (calcul en centimes)', () => {
    const src: AccountingSource = {
      ...EMPTY_SOURCE,
      sales: Array.from({ length: 50 }, (_, i) => ({
        id: `s${i}`, date: '2026-09-01', orderNumber: `VNT-${i}`, client: maquis, subtotal: 0.1 * (i + 1), packagingNet: 0.07 * i,
      })),
    }
    const r = generateEntries(src, DEFAULT_SETTINGS)
    expect(r.control.unbalancedPieces).toEqual([])
    expect(r.control.totalDebit).toBe(r.control.totalCredit)
  })

  it('documents ignorés : montant nul signalé avec la raison', () => {
    const r = generateEntries(
      { ...EMPTY_SOURCE, sales: [{ id: 'z', date: '2026-09-01', orderNumber: 'VNT-9', client: maquis, subtotal: 0, packagingNet: 0 }] },
      DEFAULT_SETTINGS
    )
    expect(r.lines).toHaveLength(0)
    expect(r.control.ignored).toEqual([{ type: 'Vente', number: 'VNT-9', date: '2026-09-01', reason: 'Montant nul' }])
  })
})

describe('Outils', () => {
  it('paiement mixte : part espèces plafonnée, le reste en Mobile Money', () => {
    expect(splitMixedPayment(1000, 400)).toEqual({ cash: 400, mobileMoney: 600 })
    expect(splitMixedPayment(1000, 5000)).toEqual({ cash: 1000, mobileMoney: 0 })
    expect(splitMixedPayment(1000, 0)).toEqual({ cash: 0, mobileMoney: 1000 })
  })

  it('modes de paiement → trésorerie', () => {
    expect(treasuryOf('cash')).toBe('cash')
    expect(treasuryOf('wave')).toBe('mobile_money')
    expect(treasuryOf('orange_money')).toBe('mobile_money')
    expect(treasuryOf('check')).toBe('bank')
    expect(treasuryOf('credit')).toBe('suspense')
    expect(treasuryOf(null)).toBe('suspense')
  })

  it('codes auxiliaires stables : code saisi prioritaire, doublons suffixés', () => {
    expect(slugAuxiliary('Maquis « Chez Ténin »')).toBe('MAQUISCHEZ')
    const codes = buildAuxiliaryCodes(
      [
        { id: '1', name: 'Bar Étoile' },
        { id: '2', name: 'Bar Etoile' },
        { id: '3', name: 'Autre', code: 'CBARETOILE' },
      ],
      'C'
    )
    expect(codes.get('3')).toBe('CBARETOILE')
    expect(codes.get('1')).toBe('CBARETOILE2')
    expect(codes.get('2')).toBe('CBARETOILE3')
  })

  it('paramètres : seules les surcharges sont stockées, valeurs invalides ignorées', () => {
    const merged = mergeSettings({ accounts: { cash: '5711', sales: 'abc', unknown: '1' }, journals: { CA: 'CAI' } })
    expect(merged.accounts.cash).toBe('5711')
    expect(merged.accounts.sales).toBe('701')
    expect(merged.journals.CA).toBe('CAI')
    expect(settingsOverrides(merged)).toEqual({ accounts: { cash: '5711' }, journals: { CA: 'CAI' } })
  })
})

describe('Formats de fichier', () => {
  const { lines } = generateEntries(realisticSource(), DEFAULT_SETTINGS)

  it('CSV générique : BOM UTF-8, séparateur ;, décimales à virgule, CRLF', () => {
    const csv = toGenericCsv(lines)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.startsWith(BOM)).toBe(true)
    const rows = csv.slice(1).split('\r\n').filter(Boolean)
    expect(rows[0]).toBe('Date;Journal;N° pièce;Compte;Compte auxiliaire;Libellé;Débit;Crédit')
    expect(rows).toHaveLength(lines.length + 1)
    const first = rows[1].split(';')
    expect(first).toHaveLength(8)
    expect(first[0]).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    expect(first[6]).toMatch(/^\d+,\d{2}$/)
    expect(csv).toContain(';1500,00;0,00')
    expect(csv).not.toMatch(/\d\.\d{2}(;|\r)/) // aucun point décimal
  })

  it('CSV générique : libellés contenant ; ou guillemets correctement échappés, anti-formule', () => {
    const csv = toGenericCsv([
      { date: '2026-09-01', journalKey: 'CA', journal: 'CA', piece: 'X', account: '571', auxiliary: null, label: 'Achat; "spécial"', debit: 1, credit: 0, pieceKey: 'k' },
      { date: '2026-09-01', journalKey: 'CA', journal: 'CA', piece: 'X', account: '658', auxiliary: null, label: '=CMD()', debit: 0, credit: 1, pieceKey: 'k' },
    ])
    expect(csv).toContain(';"Achat; ""spécial""";')
    expect(csv).toContain(";'=CMD();")
  })

  it('montants français', () => {
    expect(formatAmountFr(1500)).toBe('1500,00')
    expect(formatAmountFr(0.5)).toBe('0,50')
    expect(formatAmountFr(1234567.891)).toBe('1234567,89')
    expect(formatAmountFr(-12.5)).toBe('-12,50')
  })

  it('Sage 100 : ASCII sans BOM, date JJMMAA, libellé 35 caractères, 9 colonnes', () => {
    const txt = toSageCsv(lines)
    expect(txt.charCodeAt(0)).not.toBe(0xfeff)
    expect(/^[\x20-\x7E\r\n]*$/.test(txt)).toBe(true)
    const rows = txt.split('\r\n').filter(Boolean)
    expect(rows[0].split(';')).toHaveLength(9)
    const sale = rows.find((r) => r.includes('VNT-000001') && r.includes(';701;'))!
    const cols = sale.split(';')
    expect(cols[0]).toBe('VT')
    expect(cols[1]).toBe('020926')
    expect(cols[6].length).toBeLessThanOrEqual(35)
    expect(cols[8]).toBe('1500,00')
  })
})
