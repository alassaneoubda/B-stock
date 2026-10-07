import { pool, sql } from '../db'
import { buildAuxiliaryCodes, mergeSettings, type AccountingSettings } from './chart'
import {
  splitMixedPayment,
  treasuryOf,
  type AccountingSource,
  type ClientCreditDoc,
  type IgnoredDoc,
  type ReceiptDoc,
  type SupplierPaymentDoc,
} from './entries'

/**
 * Chargement des documents B-Stock d'une période, normalisés pour
 * `generateEntries` (lib/accounting/entries.ts). Toutes les dates sont lues
 * en SQL au format AAAA-MM-JJ (pas de conversion de fuseau côté Node ; la
 * Côte d'Ivoire est à UTC+0).
 *
 * Signification des montants (cf. lib/domain/sales.ts, lib/domain/payments.ts) :
 *  - sales_orders.subtotal        = valeur des produits ;
 *  - sales_orders.packaging_total = consignes nettes (sorties − retours de
 *    vides) × prix de consigne ; négatif si le client a rendu plus de vides
 *    qu'il n'en a emporté (déduits du prix) ;
 *  - payments                     = tout encaissement client, au moment de la
 *    vente (même horodatage que la vente) ou ultérieur (règlement de créance),
 *    payment_type = 'product' | 'packaging' ;
 *  - credit_notes.total_amount > 0 = créance (CR-…), < 0 = avoir (AV-…). Les
 *    créances nées d'une vente ne génèrent pas d'écriture (la vente porte déjà
 *    le 411) ; seules les créances saisies à la main en génèrent une.
 *
 * Colonnes / tables optionnelles (travaux parallèles) :
 *  - paiements fournisseurs (migration 031) : table `supplier_payments`
 *    détectée via information_schema, colonnes résolues dynamiquement ;
 *  - coût de revient (migration 030, sales_order_items.unit_cost) : non
 *    utilisé. L'export suit l'inventaire intermittent (achats en 601,
 *    variation de stock 6031/31 passée par le cabinet à l'inventaire).
 *    TODO : si l'inventaire permanent est demandé, générer D 6031 / C 311 au
 *    coût de revient des ventes à partir de unit_cost.
 */

type Row = Record<string, any>

const n = (v: unknown) => Number(v ?? 0) || 0
const short = (id: string) => String(id).replace(/-/g, '').slice(0, 8).toUpperCase()

/** Une table existe-t-elle ? */
async function tableExists(name: string): Promise<boolean> {
  const [row] = await sql`SELECT to_regclass(${'public.' + name}) IS NOT NULL AS ok`
  return Boolean(row?.ok)
}

/** Colonnes d'une table (vide si la table n'existe pas). */
export async function tableColumns(name: string): Promise<Set<string>> {
  const rows = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${name}
  `
  return new Set(rows.map((r) => r.column_name as string))
}

// ---------------------------------------------------------------------------
// Paramètres
// ---------------------------------------------------------------------------

export async function loadAccountingSettings(companyId: string): Promise<AccountingSettings> {
  if (!(await tableExists('accounting_settings'))) return mergeSettings(null)
  const [row] = await sql`
    SELECT accounts, journals, use_auxiliary, client_aux_prefix, supplier_aux_prefix
    FROM accounting_settings WHERE company_id = ${companyId}
  `
  return mergeSettings(row ?? null)
}

export type AuxiliaryEntity = {
  id: string
  name: string
  /** Code saisi (null = dérivé du nom). */
  customCode: string | null
  /** Code effectivement exporté. */
  code: string
}

/** Codes auxiliaires de tous les clients et fournisseurs de l'entreprise. */
export async function loadAuxiliaryCodes(
  companyId: string,
  settings: AccountingSettings
): Promise<{ clients: AuxiliaryEntity[]; suppliers: AuxiliaryEntity[] }> {
  const hasTable = await tableExists('accounting_auxiliary_codes')
  const custom = hasTable
    ? await sql`
        SELECT entity_type, entity_id, code FROM accounting_auxiliary_codes WHERE company_id = ${companyId}
      `
    : []
  const customOf = new Map(custom.map((r) => [`${r.entity_type}:${r.entity_id}`, r.code as string]))

  const clients = await sql`
    SELECT id, name FROM clients WHERE company_id = ${companyId} ORDER BY created_at ASC NULLS FIRST, id ASC
  `
  const suppliers = await sql`
    SELECT id, name FROM suppliers WHERE company_id = ${companyId} ORDER BY created_at ASC NULLS FIRST, id ASC
  `
  const build = (rows: Row[], type: 'client' | 'supplier', prefix: string): AuxiliaryEntity[] => {
    const entities = rows.map((r) => ({ id: r.id as string, name: r.name as string, code: customOf.get(`${type}:${r.id}`) ?? null }))
    const codes = buildAuxiliaryCodes(entities, prefix)
    return entities.map((e) => ({ id: e.id, name: e.name, customCode: e.code, code: codes.get(e.id)! }))
  }
  return {
    clients: build(clients, 'client', settings.clientAuxPrefix),
    suppliers: build(suppliers, 'supplier', settings.supplierAuxPrefix),
  }
}

// ---------------------------------------------------------------------------
// Documents de la période
// ---------------------------------------------------------------------------

/**
 * Documents de la période [from, to] (dates incluses, AAAA-MM-JJ).
 */
export async function loadAccountingSource(companyId: string, from: string, to: string): Promise<AccountingSource> {
  const ignored: IgnoredDoc[] = []
  const warnings: string[] = []

  // ---- Ventes ----
  const saleRows = await sql`
    SELECT so.id, so.order_number, so.status, to_char(so.created_at, 'YYYY-MM-DD') AS date,
           COALESCE(so.subtotal, 0) AS subtotal, COALESCE(so.packaging_total, 0) AS packaging_total,
           so.client_id, COALESCE(c.name, 'Client') AS client_name,
           (SELECT i.invoice_number FROM invoices i
             WHERE i.order_id = so.id AND i.company_id = so.company_id
               AND i.type = 'client' AND i.status <> 'cancelled'
             ORDER BY i.created_at ASC LIMIT 1) AS invoice_number
    FROM sales_orders so
    LEFT JOIN clients c ON c.id = so.client_id
    WHERE so.company_id = ${companyId}
      AND so.created_at >= ${from}::date AND so.created_at < ${to}::date + 1
    ORDER BY so.created_at, so.order_number
  `
  const sales: AccountingSource['sales'] = []
  for (const s of saleRows) {
    const number = s.order_number || `VNT-${short(s.id)}`
    if (s.status === 'cancelled') {
      ignored.push({ type: 'Vente', number, date: s.date, reason: 'Vente annulée (contre-passée dans B-Stock)' })
      continue
    }
    sales.push({
      id: s.id,
      date: s.date,
      orderNumber: number,
      invoiceNumber: s.invoice_number,
      client: { id: s.client_id, name: s.client_name },
      subtotal: n(s.subtotal),
      packagingNet: n(s.packaging_total),
    })
  }

  // ---- Encaissements clients ----
  const paymentRows = await sql`
    SELECT p.id, to_char(p.created_at, 'YYYY-MM-DD') AS date, p.amount, p.payment_method,
           COALESCE(p.payment_type, 'product') AS payment_type,
           p.client_id, COALESCE(c.name, 'Client') AS client_name,
           p.sales_order_id, so.order_number, so.status AS order_status,
           (so.created_at IS NOT NULL AND so.created_at = p.created_at) AS at_sale,
           (SELECT COALESCE(SUM(cm.amount), 0) FROM cash_movements cm
             WHERE cm.company_id = p.company_id AND cm.reference_type = 'sales_order'
               AND cm.reference_id = p.sales_order_id AND cm.movement_type = 'cash_in'
               AND cm.category = 'sale') AS sale_cash
    FROM payments p
    LEFT JOIN clients c ON c.id = p.client_id
    LEFT JOIN sales_orders so ON so.id = p.sales_order_id
    WHERE p.company_id = ${companyId}
      AND p.status = 'completed'
      AND p.created_at >= ${from}::date AND p.created_at < ${to}::date + 1
    ORDER BY p.created_at, p.id
  `
  const receipts: ReceiptDoc[] = []
  // Part espèces déjà affectée, par vente (paiement mixte réparti sur plusieurs lignes)
  const mixedCashLeft = new Map<string, number>()
  for (const p of paymentRows) {
    if (p.order_status === 'cancelled') continue // contre-passé avec la vente
    const piece = p.order_number || `ENC-${short(p.id)}`
    const base = {
      date: p.date as string,
      piece,
      client: { id: p.client_id as string | null, name: p.client_name as string },
      accountType: (p.payment_type === 'packaging' ? 'packaging' : 'product') as 'product' | 'packaging',
      origin: (p.at_sale ? 'sale' : 'settlement') as 'sale' | 'settlement',
    }
    if (p.payment_method === 'mixed' && p.sales_order_id) {
      const left = mixedCashLeft.has(p.sales_order_id) ? mixedCashLeft.get(p.sales_order_id)! : n(p.sale_cash)
      const split = splitMixedPayment(n(p.amount), left)
      mixedCashLeft.set(p.sales_order_id, Math.max(0, left - split.cash))
      if (split.cash > 0) receipts.push({ ...base, id: `${p.id}:cash`, amount: split.cash, treasury: 'cash' })
      if (split.mobileMoney > 0) {
        receipts.push({ ...base, id: `${p.id}:mm`, amount: split.mobileMoney, treasury: 'mobile_money' })
      }
      continue
    }
    receipts.push({ ...base, id: p.id, amount: n(p.amount), treasury: treasuryOf(p.payment_method) })
  }

  // ---- Avoirs (credit_notes négatives) et créances saisies à la main ----
  const noteRows = await sql`
    SELECT cn.id, cn.credit_number, to_char(cn.created_at, 'YYYY-MM-DD') AS date, cn.total_amount,
           COALESCE(cn.account_type, 'product') AS account_type, cn.client_id,
           COALESCE(c.name, 'Client') AS client_name,
           (so.id IS NOT NULL AND so.created_at = cn.created_at) AS from_sale
    FROM credit_notes cn
    LEFT JOIN clients c ON c.id = cn.client_id
    LEFT JOIN sales_orders so ON so.id = cn.sales_order_id
    WHERE cn.company_id = ${companyId}
      AND cn.created_at >= ${from}::date AND cn.created_at < ${to}::date + 1
    ORDER BY cn.created_at, cn.credit_number
  `
  const clientCredits: ClientCreditDoc[] = []
  const manualDebts: AccountingSource['manualDebts'] = []
  for (const cn of noteRows) {
    const amount = n(cn.total_amount)
    const piece = cn.credit_number || `CR-${short(cn.id)}`
    const client = { id: cn.client_id as string | null, name: cn.client_name as string }
    if (amount < 0) {
      clientCredits.push({
        id: cn.id,
        date: cn.date,
        piece,
        client,
        kind: 'avoir',
        productAmount: cn.account_type === 'packaging' ? 0 : -amount,
        packagingAmount: cn.account_type === 'packaging' ? -amount : 0,
      })
    } else if (amount > 0 && !cn.from_sale) {
      manualDebts.push({
        id: cn.id,
        date: cn.date,
        piece,
        client,
        amount,
        accountType: cn.account_type === 'packaging' ? 'packaging' : 'product',
      })
    }
  }

  // ---- Retours directs sur vente (POST /api/sales/[id]/return) : produits + vides ----
  const directReturns = await sql`
    WITH product_returns AS (
      SELECT sm.reference_id AS order_id, sm.created_at,
             SUM(sm.quantity * COALESCE((
               SELECT SUM(COALESCE(soi.total_price, soi.quantity * soi.unit_price)) / NULLIF(SUM(soi.quantity), 0)
               FROM sales_order_items soi
               WHERE soi.sales_order_id = sm.reference_id AND soi.product_variant_id = sm.product_variant_id
             ), 0)) AS product_amount,
             0::numeric AS packaging_amount
      FROM stock_movements sm
      WHERE sm.company_id = ${companyId} AND sm.movement_type = 'return'
        AND sm.reference_type = 'sales_order' AND sm.quantity > 0
        AND sm.created_at >= ${from}::date AND sm.created_at < ${to}::date + 1
      GROUP BY sm.reference_id, sm.created_at
    ),
    packaging_returns AS (
      SELECT pt.sales_order_id AS order_id, pt.created_at,
             0::numeric AS product_amount, SUM(COALESCE(pt.total_amount, pt.quantity * pt.unit_price, 0)) AS packaging_amount
      FROM packaging_transactions pt
      JOIN sales_orders so0 ON so0.id = pt.sales_order_id
      WHERE pt.company_id = ${companyId} AND pt.transaction_type = 'returned'
        AND pt.created_at <> so0.created_at
        AND pt.created_at >= ${from}::date AND pt.created_at < ${to}::date + 1
      GROUP BY pt.sales_order_id, pt.created_at
    ),
    all_returns AS (
      SELECT order_id, created_at, SUM(product_amount) AS product_amount, SUM(packaging_amount) AS packaging_amount
      FROM (SELECT * FROM product_returns UNION ALL SELECT * FROM packaging_returns) u
      GROUP BY order_id, created_at
    )
    SELECT r.order_id, to_char(r.created_at, 'YYYY-MM-DD') AS date,
           to_char(r.created_at, 'YYYYMMDDHH24MISSUS') AS ts,
           r.product_amount, r.packaging_amount,
           so.order_number, so.status, so.client_id, COALESCE(c.name, 'Client') AS client_name
    FROM all_returns r
    JOIN sales_orders so ON so.id = r.order_id AND so.company_id = ${companyId}
    LEFT JOIN clients c ON c.id = so.client_id
    ORDER BY r.created_at
  `
  for (const r of directReturns) {
    if (r.status === 'cancelled') continue // réintégration de stock d'une annulation
    clientCredits.push({
      id: `${r.order_id}:${r.ts}`,
      date: r.date,
      piece: r.order_number || `VNT-${short(r.order_id)}`,
      client: { id: r.client_id, name: r.client_name },
      kind: 'return',
      productAmount: Math.round(n(r.product_amount) * 100) / 100,
      packagingAmount: n(r.packaging_amount),
    })
  }

  // ---- Retours clients sans avoir (remboursement espèces / échange) : signalés ----
  const otherReturns = await sql`
    SELECT r.return_number, r.refund_method, r.total_amount, to_char(r.processed_at, 'YYYY-MM-DD') AS date
    FROM returns r
    WHERE r.company_id = ${companyId} AND r.return_type = 'client' AND r.status = 'processed'
      AND COALESCE(r.refund_method, '') <> 'credit_note'
      AND r.processed_at >= ${from}::date AND r.processed_at < ${to}::date + 1
  `
  for (const r of otherReturns) {
    ignored.push({
      type: 'Retour client',
      number: r.return_number || '—',
      date: r.date,
      reason:
        r.refund_method === 'cash'
          ? 'Remboursé en espèces : aucun mouvement financier enregistré dans B-Stock (saisir la sortie de caisse)'
          : 'Échange de marchandise : sans incidence comptable',
    })
  }

  // ---- Factures manuelles (sans vente / bon de commande B-Stock) ----
  const invoiceRows = await sql`
    SELECT i.id, i.invoice_number, i.type, i.status, i.order_id, to_char(i.created_at, 'YYYY-MM-DD') AS date,
           i.amount_paid, i.client_id, i.supplier_id,
           COALESCE(c.name, s.name, 'Tiers') AS party_name,
           COALESCE(SUM(ii.total_price) FILTER (WHERE COALESCE(ii.item_type, 'product') = 'product'), 0) AS product_amount,
           COALESCE(SUM(ii.total_price) FILTER (WHERE ii.item_type = 'packaging'), 0) AS packaging_amount,
           COALESCE(SUM(ii.total_price) FILTER (WHERE ii.item_type = 'service'), 0) AS service_amount
    FROM invoices i
    LEFT JOIN clients c ON c.id = i.client_id
    LEFT JOIN suppliers s ON s.id = i.supplier_id
    LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
    WHERE i.company_id = ${companyId}
      AND i.created_at >= ${from}::date AND i.created_at < ${to}::date + 1
      AND (i.order_id IS NULL OR i.type = 'supplier')
    GROUP BY i.id, c.name, s.name
    ORDER BY i.created_at, i.invoice_number
  `
  const manualInvoices: AccountingSource['manualInvoices'] = []
  for (const i of invoiceRows) {
    const type = i.type === 'supplier' ? 'supplier' : 'client'
    const label = type === 'client' ? 'Facture client' : 'Facture fournisseur'
    if (i.status === 'cancelled') {
      ignored.push({ type: label, number: i.invoice_number, date: i.date, reason: 'Facture annulée' })
      continue
    }
    if (i.order_id) {
      ignored.push({
        type: label,
        number: i.invoice_number,
        date: i.date,
        reason: 'Rattachée à un bon de commande : l’achat est comptabilisé à la réception',
      })
      continue
    }
    manualInvoices.push({
      id: i.id,
      date: i.date,
      piece: i.invoice_number,
      type,
      party: { id: (type === 'client' ? i.client_id : i.supplier_id) ?? null, name: i.party_name },
      productAmount: n(i.product_amount),
      packagingAmount: n(i.packaging_amount),
      serviceAmount: n(i.service_amount),
    })
    if (n(i.amount_paid) > 0) {
      warnings.push(
        `${label} ${i.invoice_number} : règlement de ${n(i.amount_paid)} FCFA saisi sans mode de paiement, non comptabilisé (à saisir par le cabinet).`
      )
    }
  }

  // ---- Dépenses ----
  const expenseRows = await sql`
    SELECT e.id, to_char(e.expense_date, 'YYYY-MM-DD') AS date, e.category, e.amount, e.description,
           m.requires_validation, m.validation_status
    FROM expenses e
    LEFT JOIN LATERAL (
      SELECT cm.requires_validation, cm.validation_status
      FROM cash_movements cm
      WHERE cm.company_id = e.company_id
        AND (
          (cm.reference_type = 'expense' AND cm.reference_id = e.id)
          OR (cm.requires_validation = true AND cm.category = 'expense'
              AND cm.cash_session_id IS NOT DISTINCT FROM e.cash_session_id
              AND cm.amount = e.amount AND cm.created_at = e.created_at)
        )
      ORDER BY (cm.reference_id = e.id) DESC NULLS LAST
      LIMIT 1
    ) m ON true
    WHERE e.company_id = ${companyId}
      AND e.expense_date >= ${from}::date AND e.expense_date <= ${to}::date
    ORDER BY e.expense_date, e.created_at, e.id
  `
  const expenses: AccountingSource['expenses'] = []
  for (const e of expenseRows) {
    const piece = `DEP-${short(e.id)}`
    if (e.requires_validation === true && e.validation_status !== 'approved') {
      ignored.push({
        type: 'Dépense',
        number: piece,
        date: e.date,
        reason: e.validation_status === 'rejected' ? 'Dépense rejetée à la validation de caisse' : 'En attente de validation de caisse',
      })
      continue
    }
    expenses.push({ id: e.id, date: e.date, piece, category: e.category, amount: n(e.amount), description: e.description })
  }

  // ---- Achats : réceptions (et retours fournisseurs), valorisées au prix d'achat ----
  const purchaseRows = await sql`
    SELECT po.id AS po_id, po.order_number, po.supplier_id, COALESCE(s.name, 'Fournisseur') AS supplier_name,
           sm.movement_type, to_char(sm.created_at, 'YYYY-MM-DD') AS date,
           to_char(sm.created_at, 'YYYYMMDDHH24MISSUS') AS ts,
           SUM(ABS(sm.quantity) * COALESCE((
             SELECT SUM(poi.unit_price * poi.quantity_ordered) / NULLIF(SUM(poi.quantity_ordered), 0)
             FROM purchase_order_items poi
             WHERE poi.purchase_order_id = po.id AND poi.product_variant_id = sm.product_variant_id
           ), 0)) AS amount
    FROM stock_movements sm
    JOIN purchase_orders po ON po.id = sm.reference_id AND po.company_id = sm.company_id
    LEFT JOIN suppliers s ON s.id = po.supplier_id
    WHERE sm.company_id = ${companyId}
      AND sm.reference_type = 'purchase_order'
      AND sm.movement_type IN ('purchase', 'return')
      AND sm.created_at >= ${from}::date AND sm.created_at < ${to}::date + 1
    GROUP BY po.id, po.order_number, po.supplier_id, s.name, sm.movement_type, sm.created_at
    ORDER BY sm.created_at
  `
  const purchases: AccountingSource['purchases'] = purchaseRows.map((p) => ({
    id: `${p.po_id}:${p.movement_type}:${p.ts}`,
    date: p.date,
    piece: p.order_number || `ACH-${short(p.po_id)}`,
    supplier: { id: p.supplier_id, name: p.supplier_name },
    amount: Math.round(n(p.amount) * 100) / 100,
    kind: p.movement_type === 'purchase' ? 'reception' : 'return',
  }))

  // ---- Paiements fournisseurs (si la table existe — migration 031) ----
  const supplierPayments = await loadSupplierPayments(companyId, from, to, warnings)

  // ---- Mouvements de caisse saisis à la main (hors dépenses), validés ----
  const cashRows = await sql`
    SELECT cm.id, to_char(cm.created_at, 'YYYY-MM-DD') AS date, cm.movement_type, cm.category,
           cm.amount, cm.description, cm.validation_status
    FROM cash_movements cm
    WHERE cm.company_id = ${companyId}
      AND cm.requires_validation = true
      AND cm.category <> 'expense'
      AND cm.created_at >= ${from}::date AND cm.created_at < ${to}::date + 1
    ORDER BY cm.created_at, cm.id
  `
  const cashMisc: AccountingSource['cashMisc'] = []
  for (const m of cashRows) {
    const piece = `CAI-${short(m.id)}`
    if (m.validation_status !== 'approved') {
      ignored.push({
        type: 'Mouvement de caisse',
        number: piece,
        date: m.date,
        reason: m.validation_status === 'rejected' ? 'Rejeté à la validation de caisse' : 'En attente de validation de caisse',
      })
      continue
    }
    cashMisc.push({
      id: m.id,
      date: m.date,
      piece,
      direction: m.movement_type === 'cash_in' ? 'in' : 'out',
      category: m.category,
      amount: n(m.amount),
      description: m.description,
    })
  }

  // ---- Écarts de clôture de caisse ----
  const varianceRows = await sql`
    SELECT cs.id, to_char(cs.closed_at, 'YYYY-MM-DD') AS date, cs.variance
    FROM cash_sessions cs
    WHERE cs.company_id = ${companyId} AND cs.status = 'closed'
      AND COALESCE(cs.variance, 0) <> 0
      AND cs.closed_at >= ${from}::date AND cs.closed_at < ${to}::date + 1
    ORDER BY cs.closed_at
  `
  const cashVariances: AccountingSource['cashVariances'] = varianceRows.map((v) => ({
    id: v.id,
    date: v.date,
    piece: `CLO-${short(v.id)}`,
    variance: n(v.variance),
  }))

  return {
    sales,
    receipts,
    clientCredits,
    manualDebts,
    manualInvoices,
    expenses,
    purchases,
    supplierPayments,
    cashMisc,
    cashVariances,
    ignored,
    warnings,
  }
}

/**
 * Paiements fournisseurs : la table est créée par un autre chantier
 * (migration 031). Elle est détectée à l'exécution et ses colonnes résolues
 * parmi des noms candidats (identifiants issus d'une liste blanche, jamais
 * de l'utilisateur). Sans la table : aucun paiement, export inchangé.
 */
async function loadSupplierPayments(
  companyId: string,
  from: string,
  to: string,
  warnings: string[]
): Promise<SupplierPaymentDoc[]> {
  const cols = await tableColumns('supplier_payments')
  if (cols.size === 0) return []
  const pick = (candidates: string[]) => candidates.find((c) => cols.has(c)) ?? null
  const amountCol = pick(['amount'])
  const supplierCol = pick(['supplier_id'])
  const dateCol = pick(['paid_at', 'payment_date', 'paid_on', 'date', 'created_at'])
  if (!cols.has('company_id') || !amountCol || !supplierCol || !dateCol) {
    warnings.push('Table des paiements fournisseurs présente mais de structure inattendue : paiements non exportés.')
    return []
  }
  const methodCol = pick(['payment_method', 'method'])
  const numberCol = pick(['payment_number', 'number', 'reference'])
  const statusFilter = cols.has('status')
    ? `AND COALESCE(sp.status, '') NOT IN ('cancelled', 'canceled', 'void', 'voided', 'failed', 'rejected', 'pending')`
    : ''
  const text = `
    SELECT sp.id, to_char(sp.${dateCol}, 'YYYY-MM-DD') AS date, sp.${amountCol} AS amount,
           ${methodCol ? `sp.${methodCol}` : 'NULL'} AS method,
           ${numberCol ? `sp.${numberCol}` : 'NULL'} AS number,
           sp.${supplierCol} AS supplier_id, COALESCE(s.name, 'Fournisseur') AS supplier_name
    FROM supplier_payments sp
    LEFT JOIN suppliers s ON s.id = sp.${supplierCol}
    WHERE sp.company_id = $1
      AND sp.${dateCol} >= $2::date AND sp.${dateCol} < $3::date + 1
      ${statusFilter}
    ORDER BY sp.${dateCol}, sp.id
  `
  const { rows } = await pool.query(text, [companyId, from, to])
  return rows.map((r) => ({
    id: String(r.id),
    date: r.date,
    piece: r.number ? String(r.number).slice(0, 20) : `RGF-${short(String(r.id))}`,
    supplier: { id: r.supplier_id, name: r.supplier_name },
    amount: n(r.amount),
    treasury: treasuryOf(r.method),
  }))
}
