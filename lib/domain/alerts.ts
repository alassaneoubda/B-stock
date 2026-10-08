import { withTransaction, type Tx } from '../db'
import { listPayables } from './payables'

/**
 * Génération automatique des alertes d'une entreprise (stock bas, péremption,
 * crédit dépassé, dette emballages, paiements en retard, factures
 * fournisseurs en retard, produits dormants, écarts de caisse répétés).
 *
 * - Requêtes ensemblistes : une lecture + une insertion groupée par type
 *   (plus de boucle N+1).
 * - Déduplication sur (alert_type, reference_type, reference_id) parmi les
 *   alertes non résolues. Pour le stock, reference_id = une ligne `stock`
 *   (donc propre à un dépôt) : deux dépôts en rupture -> deux alertes.
 * - Résolution automatique des alertes dont la condition a disparu.
 * - Une seule transaction, sérialisée par entreprise (verrou consultatif) :
 *   deux générations simultanées ne créent pas de doublons.
 *
 * Appelable depuis une route ou une future tâche planifiée (cron).
 */

export type GenerateAlertsResult = { alertsCreated: number; alertsResolved: number }

export type GenerateAlertsOptions = {
  /** Lots qui périment sous N jours (défaut : réglage de l'entreprise, sinon 30). */
  expiryDays?: number
  /** Produit dormant : en stock, aucune vente depuis N jours (défaut 30). */
  dormantDays?: number
  /** Écarts de caisse : fenêtre en jours (défaut 14). */
  cashVarianceDays?: number
  /** Écarts de caisse : nombre minimal de clôtures en manquant (défaut 3). */
  cashVarianceMinCount?: number
}

export const ALERT_DEFAULTS = { expiryDays: 30, dormantDays: 30, cashVarianceDays: 14, cashVarianceMinCount: 3 }

type Candidate = { refId: string; severity: string; title: string; message: string }

const fmt = (n: unknown) => Number(n).toLocaleString('fr-FR')
const DAY_MS = 1000 * 60 * 60 * 24

/** Insère les candidats qui n'ont pas déjà une alerte non résolue. */
async function insertNew(
  tx: Tx,
  companyId: string,
  alertType: string,
  referenceType: string,
  candidates: Candidate[]
): Promise<number> {
  if (candidates.length === 0) return 0
  const { rowCount } = await tx.exec`
    INSERT INTO alerts (company_id, alert_type, severity, title, message, reference_type, reference_id)
    SELECT DISTINCT ON (x.ref_id)
           ${companyId}::uuid, ${alertType}::text, x.severity, x.title, x.message, ${referenceType}::text, x.ref_id
    FROM unnest(
      ${candidates.map((c) => c.severity)}::text[],
      ${candidates.map((c) => c.title)}::text[],
      ${candidates.map((c) => c.message)}::text[],
      ${candidates.map((c) => c.refId)}::uuid[]
    ) AS x(severity, title, message, ref_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM alerts a
      WHERE a.company_id = ${companyId}
        AND a.alert_type = ${alertType}
        AND a.reference_type = ${referenceType}
        AND a.reference_id = x.ref_id
        AND a.is_resolved = false
    )
  `
  return rowCount
}

/**
 * Résout les alertes non résolues de ce type dont la référence n'est plus
 * dans `stillActiveIds` (y compris les anciennes alertes d'un autre
 * reference_type, ex. 'product_variant' avant la refonte).
 */
async function resolveStale(
  tx: Tx,
  companyId: string,
  alertType: string,
  referenceType: string,
  stillActiveIds: string[]
): Promise<number> {
  const { rowCount } = await tx.exec`
    UPDATE alerts SET is_resolved = true
    WHERE company_id = ${companyId}
      AND alert_type = ${alertType}
      AND is_resolved = false
      AND NOT (
        COALESCE(reference_type, '') = ${referenceType}
        AND COALESCE(reference_id = ANY(${stillActiveIds}::uuid[]), false)
      )
  `
  return rowCount
}

/**
 * @param tx transaction existante (optionnelle) ; sinon une transaction dédiée est ouverte.
 */
export async function generateAlertsForCompany(
  companyId: string,
  tx?: Tx,
  options: GenerateAlertsOptions = {}
): Promise<GenerateAlertsResult> {
  if (!tx) {
    return withTransaction((t) => generateAlertsForCompany(companyId, t, options))
  }
  return generateInTx(tx, companyId, options)
}

async function generateInTx(tx: Tx, companyId: string, options: GenerateAlertsOptions): Promise<GenerateAlertsResult> {
  await tx.sql`SELECT pg_advisory_xact_lock(hashtext(${`${companyId}:alerts`}))`

  // Délai de péremption : option, sinon réglage de l'entreprise (migration 035), sinon 30 jours
  const [setting] = await tx.sql`
    SELECT (to_jsonb(c) ->> 'alert_expiry_days')::int AS expiry_days FROM companies c WHERE c.id = ${companyId}
  `
  const expiryDays = clampDays(options.expiryDays ?? setting?.expiry_days, ALERT_DEFAULTS.expiryDays)
  const dormantDays = clampDays(options.dormantDays, ALERT_DEFAULTS.dormantDays)
  const varianceDays = clampDays(options.cashVarianceDays, ALERT_DEFAULTS.cashVarianceDays)
  const varianceMin = Math.max(1, Math.floor(options.cashVarianceMinCount ?? ALERT_DEFAULTS.cashVarianceMinCount))

  let alertsCreated = 0
  let alertsResolved = 0

  // 1. Stock bas — agrégé par (dépôt, variante) : un lot vide à côté d'un
  //    lot plein ne déclenche pas d'alerte. Référence = la plus ancienne
  //    ligne de stock du couple (stable dans le temps).
  const lowStock = await tx.sql`
    SELECT (array_agg(s.id ORDER BY s.created_at, s.id))[1] AS stock_id,
           SUM(s.quantity)::int AS quantity,
           MAX(s.min_stock_alert)::int AS min_stock_alert,
           p.name AS product_name, pt.name AS packaging_name, d.name AS depot_name
    FROM stock s
    JOIN product_variants pv ON s.product_variant_id = pv.id
    JOIN products p ON pv.product_id = p.id
    LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
    JOIN depots d ON s.depot_id = d.id AND d.company_id = ${companyId}
    WHERE p.company_id = ${companyId}
      AND p.is_active = true
    GROUP BY s.depot_id, s.product_variant_id, p.name, pt.name, d.name
    HAVING MAX(s.min_stock_alert) > 0 AND SUM(s.quantity) <= MAX(s.min_stock_alert)
  `
  alertsResolved += await resolveStale(tx, companyId, 'low_stock', 'stock', lowStock.map((r) => r.stock_id))
  alertsCreated += await insertNew(
    tx,
    companyId,
    'low_stock',
    'stock',
    lowStock.map((item) => ({
      refId: item.stock_id,
      severity: Number(item.quantity) === 0 ? 'critical' : 'high',
      title: `Stock bas : ${item.product_name}`,
      message: `${item.product_name} (${item.packaging_name ?? 'Standard'}) au dépôt ${item.depot_name} : ${item.quantity} restant(s), seuil d'alerte : ${item.min_stock_alert}`,
    }))
  )

  // 2. Péremption proche (N jours, 30 par défaut) — par lot (ligne de stock)
  const expiring = await tx.sql`
    SELECT s.id AS stock_id, s.expiry_date, s.lot_number, s.quantity,
           p.name AS product_name, d.name AS depot_name,
           (s.expiry_date >= CURRENT_DATE) AS not_expired
    FROM stock s
    JOIN product_variants pv ON s.product_variant_id = pv.id
    JOIN products p ON pv.product_id = p.id
    JOIN depots d ON s.depot_id = d.id AND d.company_id = ${companyId}
    WHERE p.company_id = ${companyId}
      AND s.expiry_date IS NOT NULL
      AND s.expiry_date <= CURRENT_DATE + ${expiryDays}::int
      AND s.quantity > 0
  `
  // Un lot déjà périmé mais encore en stock garde son alerte ouverte ;
  // seules les nouvelles alertes portent sur des lots non encore périmés.
  alertsResolved += await resolveStale(tx, companyId, 'expiry', 'stock', expiring.map((r) => r.stock_id))
  alertsCreated += await insertNew(
    tx,
    companyId,
    'expiry',
    'stock',
    expiring
      .filter((item) => item.not_expired)
      .map((item) => {
        const daysLeft = Math.max(0, Math.ceil((new Date(item.expiry_date).getTime() - Date.now()) / DAY_MS))
        return {
          refId: item.stock_id,
          severity: daysLeft <= 7 ? 'critical' : daysLeft <= 14 ? 'high' : 'medium',
          title: `Expiration proche : ${item.product_name}`,
          message: `${item.product_name} au dépôt ${item.depot_name} expire dans ${daysLeft} jour(s). Lot : ${item.lot_number || 'N/A'}, Qté : ${item.quantity}`,
        }
      })
  )

  // 3. Limite de crédit client dépassée
  const overCredit = await tx.sql`
    SELECT c.id, c.name, c.credit_limit,
           COALESCE(SUM(ABS(ca.balance)) FILTER (WHERE ca.account_type = 'product'), 0) AS product_debt
    FROM clients c
    LEFT JOIN client_accounts ca ON ca.client_id = c.id AND ca.balance < 0
    WHERE c.company_id = ${companyId}
      AND c.is_active = true
      AND c.credit_limit > 0
    GROUP BY c.id, c.name, c.credit_limit
    HAVING COALESCE(SUM(ABS(ca.balance)) FILTER (WHERE ca.account_type = 'product'), 0) > c.credit_limit
  `
  alertsResolved += await resolveStale(tx, companyId, 'credit_limit', 'client', overCredit.map((r) => r.id))
  alertsCreated += await insertNew(
    tx,
    companyId,
    'credit_limit',
    'client',
    overCredit.map((client) => ({
      refId: client.id,
      severity: 'high',
      title: `Crédit dépassé : ${client.name}`,
      message: `Le client ${client.name} a une dette produit de ${fmt(client.product_debt)} FCFA, dépassant sa limite de ${fmt(client.credit_limit)} FCFA`,
    }))
  )

  // 4. Dette emballages au-delà de la limite
  const packagingDebt = await tx.sql`
    SELECT c.id, c.name, c.packaging_credit_limit, ABS(ca.balance) AS packaging_debt
    FROM clients c
    JOIN client_accounts ca ON ca.client_id = c.id AND ca.account_type = 'packaging'
    WHERE c.company_id = ${companyId}
      AND c.is_active = true
      AND ca.balance < 0
      AND c.packaging_credit_limit > 0
      AND ABS(ca.balance) > c.packaging_credit_limit
  `
  alertsResolved += await resolveStale(tx, companyId, 'packaging_debt', 'client', packagingDebt.map((r) => r.id))
  alertsCreated += await insertNew(
    tx,
    companyId,
    'packaging_debt',
    'client',
    packagingDebt.map((client) => ({
      refId: client.id,
      severity: 'medium',
      title: `Emballages non rendus : ${client.name}`,
      message: `Le client ${client.name} a une dette emballage de ${fmt(client.packaging_debt)} FCFA, dépassant sa limite de ${fmt(client.packaging_credit_limit)} FCFA`,
    }))
  )

  // 5. Paiements en retard
  const overdue = await tx.sql`
    SELECT so.id, so.order_number, so.total_amount, so.paid_amount, so.created_at,
           c.name AS client_name, c.payment_terms_days
    FROM sales_orders so
    JOIN clients c ON so.client_id = c.id AND c.company_id = ${companyId}
    WHERE so.company_id = ${companyId}
      AND so.status <> 'cancelled'
      AND COALESCE(so.paid_amount, 0) < so.total_amount
      AND c.payment_terms_days > 0
      AND so.created_at + make_interval(days => c.payment_terms_days) < NOW()
  `
  alertsResolved += await resolveStale(tx, companyId, 'payment_overdue', 'sales_order', overdue.map((r) => r.id))
  alertsCreated += await insertNew(
    tx,
    companyId,
    'payment_overdue',
    'sales_order',
    overdue.map((order) => {
      const remaining = Number(order.total_amount) - Number(order.paid_amount ?? 0)
      const daysOverdue =
        Math.ceil((Date.now() - new Date(order.created_at).getTime()) / DAY_MS) - Number(order.payment_terms_days)
      return {
        refId: order.id,
        severity: daysOverdue > 30 ? 'critical' : daysOverdue > 14 ? 'high' : 'medium',
        title: `Paiement en retard : ${order.client_name}`,
        message: `Commande ${order.order_number} — ${order.client_name} : ${fmt(remaining)} FCFA impayés, ${daysOverdue} jour(s) de retard`,
      }
    })
  )

  // 6. Factures fournisseurs en retard (bon de commande reçu, reste à payer, échéance dépassée)
  const supplierOverdue = (await listPayables(tx.sql, companyId)).filter((p) => p.payment_status === 'overdue')
  alertsResolved += await resolveStale(
    tx,
    companyId,
    'supplier_overdue',
    'purchase_order',
    supplierOverdue.map((p) => p.purchase_order_id)
  )
  alertsCreated += await insertNew(
    tx,
    companyId,
    'supplier_overdue',
    'purchase_order',
    supplierOverdue.map((p) => ({
      refId: p.purchase_order_id,
      severity: p.days_overdue > 30 ? 'critical' : p.days_overdue > 14 ? 'high' : 'medium',
      title: `Facture fournisseur en retard : ${p.supplier_name ?? 'Fournisseur'}`,
      message: `Commande ${p.order_number} — ${p.supplier_name ?? 'Fournisseur'} : ${fmt(p.remaining)} FCFA à payer, échéance dépassée de ${p.days_overdue} jour(s)`,
    }))
  )

  // 7. Produits dormants — en stock (tous dépôts) mais aucune vente depuis N jours ;
  //    valeur immobilisée au CMP de chaque dépôt (repli : prix d'achat catalogue).
  //    Un produit jamais vendu n'est signalé que s'il existe depuis plus de N jours.
  const dormant = await tx.sql`
    WITH st AS (
      SELECT s.product_variant_id, SUM(s.quantity)::int AS quantity,
             SUM(s.quantity * COALESCE(sc.avg_cost, pv.cost_price, 0)) AS value
      FROM stock s
      JOIN depots d ON d.id = s.depot_id AND d.company_id = ${companyId}
      JOIN product_variants pv ON pv.id = s.product_variant_id
      LEFT JOIN stock_costs sc ON sc.depot_id = s.depot_id AND sc.product_variant_id = s.product_variant_id
      GROUP BY s.product_variant_id
      HAVING SUM(s.quantity) > 0
    )
    SELECT st.product_variant_id AS variant_id, st.quantity, ROUND(st.value) AS value,
           p.name AS product_name, pt.name AS packaging_name, ls.last_sale_at,
           (CURRENT_DATE - COALESCE(ls.last_sale_at, p.created_at)::date) AS idle_days
    FROM st
    JOIN product_variants pv ON pv.id = st.product_variant_id
    JOIN products p ON p.id = pv.product_id AND p.company_id = ${companyId} AND p.is_active = true
    LEFT JOIN packaging_types pt ON pt.id = pv.packaging_type_id
    LEFT JOIN LATERAL (
      SELECT MAX(so.created_at) AS last_sale_at
      FROM sales_order_items soi
      JOIN sales_orders so ON so.id = soi.sales_order_id
      WHERE soi.product_variant_id = st.product_variant_id
        AND so.company_id = ${companyId} AND so.status <> 'cancelled'
    ) ls ON true
    WHERE COALESCE(ls.last_sale_at, p.created_at) < NOW() - make_interval(days => ${dormantDays}::int)
  `
  alertsResolved += await resolveStale(tx, companyId, 'dormant_stock', 'product_variant', dormant.map((r) => r.variant_id))
  alertsCreated += await insertNew(
    tx,
    companyId,
    'dormant_stock',
    'product_variant',
    dormant.map((d) => {
      const label =
        d.packaging_name && !String(d.packaging_name).startsWith('Emballage - ')
          ? `${d.product_name} (${d.packaging_name})`
          : d.product_name
      const value = Number(d.value)
      return {
        refId: d.variant_id,
        severity: value >= 500_000 ? 'high' : value >= 100_000 ? 'medium' : 'low',
        title: `Produit dormant : ${d.product_name}`,
        message:
          `${label} : ${fmt(d.quantity)} en stock sans aucune vente depuis ` +
          (d.last_sale_at ? `${d.idle_days} jour(s)` : `sa création (${d.idle_days} jour(s))`) +
          `. Valeur immobilisée : ${fmt(value)} FCFA au coût moyen.`,
      }
    })
  )

  // 8. Écarts de caisse répétés — au moins N clôtures en manquant (écart < 0)
  //    sur la fenêtre, pour un même utilisateur (celui qui a clôturé la caisse).
  const variances = await tx.sql`
    SELECT cs.closed_by AS user_id, COALESCE(u.full_name, u.name, u.email, 'Utilisateur') AS user_name,
           COUNT(*)::int AS sessions, SUM(cs.variance) AS total_variance, MIN(cs.variance) AS worst
    FROM cash_sessions cs
    JOIN users u ON u.id = cs.closed_by
    WHERE cs.company_id = ${companyId} AND cs.status = 'closed'
      AND cs.variance < 0
      AND cs.closed_at >= NOW() - make_interval(days => ${varianceDays}::int)
    GROUP BY cs.closed_by, u.full_name, u.name, u.email
    HAVING COUNT(*) >= ${varianceMin}::int
  `
  alertsResolved += await resolveStale(tx, companyId, 'cash_variance', 'user', variances.map((r) => r.user_id))
  alertsCreated += await insertNew(
    tx,
    companyId,
    'cash_variance',
    'user',
    variances.map((v) => ({
      refId: v.user_id,
      severity: Number(v.sessions) >= varianceMin * 2 ? 'critical' : 'high',
      title: `Écarts de caisse répétés : ${v.user_name}`,
      message:
        `${v.user_name} : ${v.sessions} clôture(s) de caisse en manquant sur les ${varianceDays} derniers jours, ` +
        `total ${fmt(Math.abs(Number(v.total_variance)))} FCFA (plus gros écart : ${fmt(Math.abs(Number(v.worst)))} FCFA).`,
    }))
  )

  return { alertsCreated, alertsResolved }
}

function clampDays(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n >= 1 && n <= 365 ? n : fallback
}
