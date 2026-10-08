import {
  EXPENSE_CATEGORY_ACCOUNT,
  EXPENSE_CATEGORY_LABELS,
  JOURNAL_KEYS,
  slugAuxiliary,
  type AccountKey,
  type AccountingSettings,
  type JournalKey,
} from './chart'

/**
 * Génération PURE des écritures comptables (aucun accès base) à partir de
 * documents B-Stock normalisés par `lib/accounting/source.ts`.
 *
 * Toutes les écritures sont en partie double et équilibrées PAR PIÈCE
 * (total débit = total crédit), calculées en centimes entiers pour éviter les
 * erreurs d'arrondi. Le contrôle (`control`) recompte l'équilibre de chaque
 * pièce : `unbalancedPieces` doit être vide.
 *
 * Règles d'écritures (comptes par défaut SYSCOHADA, cf. chart.ts) :
 *
 * VT — Vente B-Stock (pièce = n° de vente VNT-…, date de la vente)
 *    D 411 client           montant des produits (subtotal)
 *    C 701 ventes           montant des produits
 *    Consignes nettes facturées (sorties − retours de vides > 0) :
 *    D 411 client / C 4194 consignes (dette envers le client, PAS du chiffre d'affaires)
 *    Vides rendus en plus des sorties (net < 0, déduits du prix) :
 *    D 4194 consignes / C 411 client
 *    TVA (entreprise assujettie, TVA figée sur les lignes de la vente) :
 *    D 411 TTC / C 701 HT / C 4431 TVA collectée (consignes : jamais de TVA).
 *    La vente à crédit et la vente au comptant s'écrivent de la même façon :
 *    c'est l'encaissement (ci-dessous) qui solde le 411.
 *
 * CA / BQ / MM — Encaissement client (paiement au moment de la vente OU
 * règlement ultérieur d'une créance, produits ou consignes)
 *    D 571 caisse | 521 banque | 5211 Mobile Money    montant
 *    C 411 client                                    montant
 *    Mode de paiement inconnu → D 471 compte d'attente (journal OD) + alerte.
 *
 * OD — Avoir AV-… (retour client avec avoir) et retour direct sur vente
 *    Produits   : D 709 RRR accordés (HT) [+ D 4431 TVA contenue] / C 411 client (TTC)
 *    Emballages : D 4194 consignes   / C 411 client (remboursement de consigne)
 * OD — Créance saisie à la main (CR-… hors vente) : D 411 / C 471 + alerte.
 *
 * AC — Réception d'achat (pièce = bon ACH-…, date de réception)
 *    D 601 achats / C 401 fournisseur   (quantités reçues en bon état × prix d'achat)
 *    Achat avec TVA (taux saisi sur la ligne, prix d'achat HT) :
 *    D 601 HT / D 4452 TVA récupérable / C 401 TTC.
 *    Retour fournisseur : D 401 / C 601 (et C 4452 si TVA).
 *    Facture client manuelle avec TVA : C 701/706 HT + C 4431 TVA.
 *    Facture fournisseur manuelle (hors bon de commande) : D 601 | 4094 | 605 / C 401.
 * BQ / CA / MM — Paiement fournisseur (si la table existe) : D 401 / C trésorerie.
 *
 * CA — Dépense de caisse : D 6xx (selon la catégorie) / C 571.
 * CA — Mouvement manuel validé : dépôt D 571 / C 585, retrait D 585 / C 571,
 *      autre D 571 / C 471 (ou l'inverse) + alerte.
 * CA — Écart de clôture de caisse : excédent D 571 / C 758, manquant D 658 / C 571.
 */

export type Treasury = 'cash' | 'bank' | 'mobile_money' | 'suspense'

export type Party = { id: string | null; name: string }

export type SaleDoc = {
  id: string
  date: string
  orderNumber: string
  invoiceNumber?: string | null
  client: Party
  /** Valeur des produits vendus. */
  subtotal: number
  /** Consignes nettes : > 0 consignes facturées, < 0 vides rendus en plus. */
  packagingNet: number
  /** TVA collectée contenue dans les produits (0 / absent : vente sans TVA). */
  vat?: number
}

export type ReceiptDoc = {
  id: string
  date: string
  piece: string
  client: Party
  amount: number
  treasury: Treasury
  accountType: 'product' | 'packaging'
  origin: 'sale' | 'settlement'
}

export type ClientCreditDoc = {
  id: string
  date: string
  piece: string
  client: Party
  kind: 'avoir' | 'return'
  productAmount: number
  packagingAmount: number
  /** TVA contenue dans la part produits (TTC) de l'avoir / du retour. */
  productVat?: number
}

export type ManualDebtDoc = {
  id: string
  date: string
  piece: string
  client: Party
  amount: number
  accountType: 'product' | 'packaging'
}

export type ManualInvoiceDoc = {
  id: string
  date: string
  piece: string
  type: 'client' | 'supplier'
  party: Party
  productAmount: number
  packagingAmount: number
  serviceAmount: number
  /** TVA des lignes produits / services (montants ci-dessus TTC). */
  vat?: number
}

export type ExpenseDoc = {
  id: string
  date: string
  piece: string
  category: string
  amount: number
  description?: string | null
}

export type PurchaseDoc = {
  id: string
  date: string
  piece: string
  supplier: Party
  /** Montant HT (quantités × prix d'achat). */
  amount: number
  kind: 'reception' | 'return'
  /** TVA récupérable (achats saisis avec un taux) ; le fournisseur est crédité HT + TVA. */
  vat?: number
}

export type SupplierPaymentDoc = {
  id: string
  date: string
  piece: string
  supplier: Party
  amount: number
  treasury: Treasury
}

export type CashMiscDoc = {
  id: string
  date: string
  piece: string
  direction: 'in' | 'out'
  category: string
  amount: number
  description?: string | null
}

export type CashVarianceDoc = {
  id: string
  date: string
  piece: string
  /** Compté − attendu : > 0 excédent, < 0 manquant. */
  variance: number
}

export type IgnoredDoc = {
  type: string
  number: string
  date: string
  reason: string
}

export type AccountingSource = {
  sales: SaleDoc[]
  receipts: ReceiptDoc[]
  clientCredits: ClientCreditDoc[]
  manualDebts: ManualDebtDoc[]
  manualInvoices: ManualInvoiceDoc[]
  expenses: ExpenseDoc[]
  purchases: PurchaseDoc[]
  supplierPayments: SupplierPaymentDoc[]
  cashMisc: CashMiscDoc[]
  cashVariances: CashVarianceDoc[]
  /** Documents écartés dès le chargement (annulés, en attente…). */
  ignored: IgnoredDoc[]
  /** Avertissements du chargement (ex. table de paiements fournisseurs absente). */
  warnings: string[]
}

export const EMPTY_SOURCE: AccountingSource = {
  sales: [],
  receipts: [],
  clientCredits: [],
  manualDebts: [],
  manualInvoices: [],
  expenses: [],
  purchases: [],
  supplierPayments: [],
  cashMisc: [],
  cashVariances: [],
  ignored: [],
  warnings: [],
}

export type EntryLine = {
  /** AAAA-MM-JJ */
  date: string
  journalKey: JournalKey
  /** Code journal paramétré (ex. « VT »). */
  journal: string
  piece: string
  account: string
  auxiliary: string | null
  label: string
  debit: number
  credit: number
  /** Identifiant interne de la pièce (contrôle d'équilibre). */
  pieceKey: string
}

export type UnbalancedPiece = { pieceKey: string; piece: string; journal: string; debit: number; credit: number }

export type JournalTotal = { journalKey: JournalKey; journal: string; label?: string; lines: number; pieces: number; debit: number; credit: number }

export type AccountingControl = {
  lineCount: number
  pieceCount: number
  totalDebit: number
  totalCredit: number
  balanced: boolean
  unbalancedPieces: UnbalancedPiece[]
  byJournal: JournalTotal[]
  ignored: IgnoredDoc[]
  warnings: string[]
}

export type AccountingResult = { lines: EntryLine[]; control: AccountingControl }

export type GenerateOptions = {
  /** Journaux à inclure (tous par défaut). */
  journals?: JournalKey[]
  /** Codes auxiliaires par id de client / fournisseur. */
  clientCodes?: Map<string, string>
  supplierCodes?: Map<string, string>
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

export const toCents = (v: number) => Math.round((Number(v) || 0) * 100)
export const fromCents = (c: number) => c / 100

/** Mode de paiement B-Stock → compte de trésorerie. */
export function treasuryOf(method: string | null | undefined): Treasury {
  switch ((method || '').toLowerCase()) {
    case 'cash':
    case 'especes':
      return 'cash'
    case 'mobile_money':
    case 'orange_money':
    case 'mtn_money':
    case 'moov_money':
    case 'wave':
      return 'mobile_money'
    case 'bank_transfer':
    case 'bank':
    case 'check':
    case 'cheque':
    case 'card':
      return 'bank'
    default:
      return 'suspense'
  }
}

const TREASURY_ACCOUNT: Record<Treasury, AccountKey> = {
  cash: 'cash',
  bank: 'bank',
  mobile_money: 'mobile_money',
  suspense: 'suspense',
}

const TREASURY_JOURNAL: Record<Treasury, JournalKey> = {
  cash: 'CA',
  bank: 'BQ',
  mobile_money: 'MM',
  suspense: 'OD',
}

/**
 * Paiement « mixte » d'une vente : la part espèces est celle réellement
 * portée en caisse ; le reste a été encaissé en Mobile Money (seul autre
 * moyen proposé par l'écran de vente).
 */
export function splitMixedPayment(total: number, cashRecorded: number): { cash: number; mobileMoney: number } {
  const t = toCents(total)
  const c = Math.min(Math.max(0, toCents(cashRecorded)), t)
  return { cash: fromCents(c), mobileMoney: fromCents(t - c) }
}

type PieceLine = { account: string; auxiliary: string | null; label: string; debit: number; credit: number }

class PieceBuilder {
  lines: PieceLine[] = []
  constructor(
    readonly journalKey: JournalKey,
    readonly piece: string,
    readonly date: string,
    readonly key: string,
    readonly label: string
  ) {}

  /** Débit (montant négatif → crédit). Montant nul ignoré. */
  debit(account: string, cents: number, auxiliary: string | null = null, label = this.label): PieceBuilder {
    if (cents === 0) return this
    if (cents < 0) return this.credit(account, -cents, auxiliary, label)
    this.lines.push({ account, auxiliary, label, debit: cents, credit: 0 })
    return this
  }

  credit(account: string, cents: number, auxiliary: string | null = null, label = this.label): PieceBuilder {
    if (cents === 0) return this
    if (cents < 0) return this.debit(account, -cents, auxiliary, label)
    this.lines.push({ account, auxiliary, label, debit: 0, credit: cents })
    return this
  }
}

const docDate = (d: string) => (d || '').slice(0, 10)

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------

export function generateEntries(
  source: AccountingSource,
  settings: AccountingSettings,
  options: GenerateOptions = {}
): AccountingResult {
  const acc = settings.accounts
  const included = new Set<JournalKey>(options.journals && options.journals.length > 0 ? options.journals : JOURNAL_KEYS)
  const pieces: PieceBuilder[] = []
  const ignored: IgnoredDoc[] = [...source.ignored]
  const warnings: string[] = [...source.warnings]
  const counters = { suspenseReceipts: 0, manualDebts: 0, cashOther: 0, suspenseSupplierPayments: 0 }

  const clientAux = (p: Party): string | null => {
    if (!settings.useAuxiliary || !p.id) return null
    return options.clientCodes?.get(p.id) ?? (settings.clientAuxPrefix + slugAuxiliary(p.name)).slice(0, 17)
  }
  const supplierAux = (p: Party): string | null => {
    if (!settings.useAuxiliary || !p.id) return null
    return options.supplierCodes?.get(p.id) ?? (settings.supplierAuxPrefix + slugAuxiliary(p.name)).slice(0, 17)
  }
  const newPiece = (journalKey: JournalKey, piece: string, date: string, key: string, label: string) => {
    const p = new PieceBuilder(journalKey, piece, docDate(date), key, label.slice(0, 120))
    pieces.push(p)
    return p
  }

  // ---- VT : ventes ----
  for (const s of source.sales) {
    const subtotal = toCents(s.subtotal)
    const pkg = toCents(s.packagingNet)
    if (subtotal === 0 && pkg === 0) {
      ignored.push({ type: 'Vente', number: s.orderNumber, date: docDate(s.date), reason: 'Montant nul' })
      continue
    }
    const aux = clientAux(s.client)
    const ref = s.invoiceNumber ? `${s.orderNumber} (${s.invoiceNumber})` : s.orderNumber
    const p = newPiece('VT', s.orderNumber, s.date, `VT|sale|${s.id}`, `Vente ${ref} ${s.client.name}`)
    const saleVat = toCents(s.vat ?? 0)
    p.debit(acc.clients, subtotal, aux)
    p.credit(acc.sales, subtotal - saleVat)
    p.credit(acc.vat_collected, saleVat, null, `TVA collectée ${s.orderNumber}`)
    if (pkg > 0) {
      const label = `Consignes ${s.orderNumber} ${s.client.name}`
      p.debit(acc.clients, pkg, aux, label)
      p.credit(acc.packaging_clients, pkg, null, label)
    } else if (pkg < 0) {
      const label = `Vides rendus ${s.orderNumber} ${s.client.name}`
      p.debit(acc.packaging_clients, -pkg, null, label)
      p.credit(acc.clients, -pkg, aux, label)
    }
  }

  // ---- VT / AC : factures manuelles (sans vente ni bon de commande B-Stock) ----
  for (const inv of source.manualInvoices) {
    const product = toCents(inv.productAmount)
    const packaging = toCents(inv.packagingAmount)
    const service = toCents(inv.serviceAmount)
    const total = product + packaging + service
    if (total === 0) {
      ignored.push({
        type: inv.type === 'client' ? 'Facture client' : 'Facture fournisseur',
        number: inv.piece,
        date: docDate(inv.date),
        reason: 'Montant nul',
      })
      continue
    }
    if (inv.type === 'client') {
      const aux = clientAux(inv.party)
      const p = newPiece('VT', inv.piece, inv.date, `VT|invoice|${inv.id}`, `Facture ${inv.piece} ${inv.party.name}`)
      // TVA répartie au prorata produits / services (montants TTC)
      const vat = toCents(inv.vat ?? 0)
      const vatOnProduct = product + service > 0 ? Math.round((vat * product) / (product + service)) : 0
      p.debit(acc.clients, total, aux)
      p.credit(acc.sales, product - vatOnProduct)
      p.credit(acc.packaging_clients, packaging)
      p.credit(acc.services, service - (vat - vatOnProduct))
      p.credit(acc.vat_collected, vat, null, `TVA collectée ${inv.piece}`)
    } else {
      const aux = supplierAux(inv.party)
      const p = newPiece('AC', inv.piece, inv.date, `AC|invoice|${inv.id}`, `Facture ${inv.piece} ${inv.party.name}`)
      p.debit(acc.purchases, product)
      p.debit(acc.packaging_suppliers, packaging)
      p.debit(acc.purchases_services, service)
      p.credit(acc.suppliers, total, aux)
    }
  }

  // ---- CA / BQ / MM : encaissements clients ----
  for (const r of source.receipts) {
    const amount = toCents(r.amount)
    if (amount === 0) continue
    if (r.treasury === 'suspense') counters.suspenseReceipts++
    const what = r.accountType === 'packaging' ? 'Encaissement consignes' : 'Encaissement'
    const p = newPiece(
      TREASURY_JOURNAL[r.treasury],
      r.piece,
      r.date,
      `${TREASURY_JOURNAL[r.treasury]}|receipt|${r.id}`,
      `${what} ${r.piece} ${r.client.name}`
    )
    p.debit(acc[TREASURY_ACCOUNT[r.treasury]], amount)
    p.credit(acc.clients, amount, clientAux(r.client))
  }

  // ---- OD : avoirs et retours sur vente ----
  for (const c of source.clientCredits) {
    const product = toCents(c.productAmount)
    const packaging = toCents(c.packagingAmount)
    if (product === 0 && packaging === 0) continue
    const aux = clientAux(c.client)
    const title = c.kind === 'avoir' ? 'Avoir' : 'Retour sur vente'
    const p = newPiece('OD', c.piece, c.date, `OD|credit|${c.id}`, `${title} ${c.piece} ${c.client.name}`)
    if (product !== 0) {
      const creditVat = toCents(c.productVat ?? 0)
      p.debit(acc.sales_returns, product - creditVat)
      p.debit(acc.vat_collected, creditVat, null, `TVA sur avoir ${c.piece}`)
      p.credit(acc.clients, product, aux)
    }
    if (packaging !== 0) {
      const label = `Remboursement consignes ${c.piece} ${c.client.name}`
      p.debit(acc.packaging_clients, packaging, null, label)
      p.credit(acc.clients, packaging, aux, label)
    }
  }

  // ---- OD : créances saisies à la main ----
  for (const d of source.manualDebts) {
    const amount = toCents(d.amount)
    if (amount === 0) continue
    counters.manualDebts++
    const p = newPiece('OD', d.piece, d.date, `OD|debt|${d.id}`, `Créance manuelle ${d.piece} ${d.client.name}`)
    p.debit(acc.clients, amount, clientAux(d.client))
    p.credit(acc.suspense, amount)
  }

  // ---- AC : réceptions et retours fournisseurs ----
  for (const a of source.purchases) {
    const amount = toCents(a.amount)
    if (amount === 0) {
      ignored.push({
        type: a.kind === 'reception' ? 'Réception d’achat' : 'Retour fournisseur',
        number: a.piece,
        date: docDate(a.date),
        reason: 'Montant nul (prix d’achat non renseigné ?)',
      })
      continue
    }
    const aux = supplierAux(a.supplier)
    const purchaseVat = toCents(a.vat ?? 0)
    if (a.kind === 'reception') {
      const p = newPiece('AC', a.piece, a.date, `AC|purchase|${a.id}`, `Achat ${a.piece} ${a.supplier.name}`)
      p.debit(acc.purchases, amount)
      p.debit(acc.vat_deductible, purchaseVat, null, `TVA récupérable ${a.piece}`)
      p.credit(acc.suppliers, amount + purchaseVat, aux)
    } else {
      const p = newPiece('AC', a.piece, a.date, `AC|preturn|${a.id}`, `Retour fournisseur ${a.piece} ${a.supplier.name}`)
      p.debit(acc.suppliers, amount + purchaseVat, aux)
      p.credit(acc.purchases, amount)
      p.credit(acc.vat_deductible, purchaseVat, null, `TVA récupérable ${a.piece}`)
    }
  }

  // ---- BQ / CA / MM : paiements fournisseurs ----
  for (const sp of source.supplierPayments) {
    const amount = toCents(sp.amount)
    if (amount === 0) continue
    if (sp.treasury === 'suspense') counters.suspenseSupplierPayments++
    const journal = TREASURY_JOURNAL[sp.treasury]
    const p = newPiece(journal, sp.piece, sp.date, `${journal}|spay|${sp.id}`, `Règlement ${sp.piece} ${sp.supplier.name}`)
    p.debit(acc.suppliers, amount, supplierAux(sp.supplier))
    p.credit(acc[TREASURY_ACCOUNT[sp.treasury]], amount)
  }

  // ---- CA : dépenses ----
  for (const e of source.expenses) {
    const amount = toCents(e.amount)
    if (amount === 0) continue
    const key = EXPENSE_CATEGORY_ACCOUNT[e.category] ?? 'expense_other'
    const category = EXPENSE_CATEGORY_LABELS[e.category] ?? e.category
    const label = `Dépense ${category}${e.description ? ` ${e.description}` : ''}`
    const p = newPiece('CA', e.piece, e.date, `CA|expense|${e.id}`, label)
    p.debit(acc[key], amount)
    p.credit(acc.cash, amount)
  }

  // ---- CA : mouvements manuels de caisse ----
  for (const m of source.cashMisc) {
    const amount = toCents(m.amount)
    if (amount === 0) continue
    const isTransfer = m.category === 'deposit' || m.category === 'withdrawal'
    if (!isTransfer) counters.cashOther++
    const counterpart = isTransfer ? acc.transfers : acc.suspense
    const title =
      m.category === 'deposit' ? 'Dépôt en caisse' : m.category === 'withdrawal' ? 'Retrait de caisse' : 'Mouvement de caisse'
    const label = `${title}${m.description ? ` ${m.description}` : ''}`
    const p = newPiece('CA', m.piece, m.date, `CA|cashmisc|${m.id}`, label)
    if (m.direction === 'in') {
      p.debit(acc.cash, amount)
      p.credit(counterpart, amount)
    } else {
      p.debit(counterpart, amount)
      p.credit(acc.cash, amount)
    }
  }

  // ---- CA : écarts de clôture de caisse ----
  for (const v of source.cashVariances) {
    const variance = toCents(v.variance)
    if (variance === 0) continue
    if (variance > 0) {
      const p = newPiece('CA', v.piece, v.date, `CA|variance|${v.id}`, `Excédent de caisse ${v.piece}`)
      p.debit(acc.cash, variance)
      p.credit(acc.cash_over, variance)
    } else {
      const p = newPiece('CA', v.piece, v.date, `CA|variance|${v.id}`, `Manquant de caisse ${v.piece}`)
      p.debit(acc.cash_short, -variance)
      p.credit(acc.cash, -variance)
    }
  }

  // ---- Alertes de ventilation ----
  if (counters.suspenseReceipts > 0) {
    warnings.push(
      `${counters.suspenseReceipts} encaissement(s) sans mode de paiement identifiable, imputé(s) au compte d'attente ${acc.suspense} : à ventiler.`
    )
  }
  if (counters.suspenseSupplierPayments > 0) {
    warnings.push(
      `${counters.suspenseSupplierPayments} paiement(s) fournisseur sans mode de paiement identifiable, imputé(s) au compte d'attente ${acc.suspense}.`
    )
  }
  if (counters.manualDebts > 0) {
    warnings.push(
      `${counters.manualDebts} créance(s) saisie(s) à la main (hors vente) : contrepartie au compte d'attente ${acc.suspense}, à justifier (reprise de solde ?).`
    )
  }
  if (counters.cashOther > 0) {
    warnings.push(
      `${counters.cashOther} mouvement(s) de caisse manuel(s) « autre » ou « remboursement » imputé(s) au compte d'attente ${acc.suspense}.`
    )
  }

  // ---- Lignes + contrôle ----
  const journalOrder = new Map(JOURNAL_KEYS.map((k, i) => [k, i]))
  const kept = pieces
    .filter((p) => included.has(p.journalKey) && p.lines.length > 0)
    .sort(
      (a, b) =>
        journalOrder.get(a.journalKey)! - journalOrder.get(b.journalKey)! ||
        a.date.localeCompare(b.date) ||
        a.piece.localeCompare(b.piece) ||
        a.key.localeCompare(b.key)
    )

  const lines: EntryLine[] = []
  const unbalancedPieces: UnbalancedPiece[] = []
  const totals = new Map<JournalKey, { lines: number; pieces: number; debit: number; credit: number }>()
  let totalDebit = 0
  let totalCredit = 0

  for (const p of kept) {
    let d = 0
    let c = 0
    const journal = settings.journals[p.journalKey]
    for (const l of p.lines) {
      d += l.debit
      c += l.credit
      lines.push({
        date: p.date,
        journalKey: p.journalKey,
        journal,
        piece: p.piece,
        account: l.account,
        auxiliary: l.auxiliary,
        label: l.label,
        debit: fromCents(l.debit),
        credit: fromCents(l.credit),
        pieceKey: p.key,
      })
    }
    if (d !== c) unbalancedPieces.push({ pieceKey: p.key, piece: p.piece, journal, debit: fromCents(d), credit: fromCents(c) })
    totalDebit += d
    totalCredit += c
    const t = totals.get(p.journalKey) ?? { lines: 0, pieces: 0, debit: 0, credit: 0 }
    t.lines += p.lines.length
    t.pieces += 1
    t.debit += d
    t.credit += c
    totals.set(p.journalKey, t)
  }

  const byJournal: JournalTotal[] = JOURNAL_KEYS.filter((k) => totals.has(k)).map((k) => {
    const t = totals.get(k)!
    return {
      journalKey: k,
      journal: settings.journals[k],
      lines: t.lines,
      pieces: t.pieces,
      debit: fromCents(t.debit),
      credit: fromCents(t.credit),
    }
  })

  return {
    lines,
    control: {
      lineCount: lines.length,
      pieceCount: kept.length,
      totalDebit: fromCents(totalDebit),
      totalCredit: fromCents(totalCredit),
      balanced: totalDebit === totalCredit && unbalancedPieces.length === 0,
      unbalancedPieces,
      byJournal,
      ignored,
      warnings,
    },
  }
}

/** Contrôle d'équilibre indépendant (par pièce), utilisable sur des lignes déjà produites. */
export function findUnbalancedPieces(lines: EntryLine[]): UnbalancedPiece[] {
  const sums = new Map<string, { piece: string; journal: string; d: number; c: number }>()
  for (const l of lines) {
    const s = sums.get(l.pieceKey) ?? { piece: l.piece, journal: l.journal, d: 0, c: 0 }
    s.d += toCents(l.debit)
    s.c += toCents(l.credit)
    sums.set(l.pieceKey, s)
  }
  return [...sums.entries()]
    .filter(([, s]) => s.d !== s.c)
    .map(([pieceKey, s]) => ({ pieceKey, piece: s.piece, journal: s.journal, debit: fromCents(s.d), credit: fromCents(s.c) }))
}
