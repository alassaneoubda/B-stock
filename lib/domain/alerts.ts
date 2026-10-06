import { withTransaction, type Tx } from '../db'

/**
 * Génération automatique des alertes d'une entreprise (stock bas, péremption,
 * crédit dépassé, dette emballages, paiements en retard).
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
export async function generateAlertsForCompany(companyId: string, tx?: Tx): Promise<GenerateAlertsResult> {
  if (!tx) {
    return withTransaction((t) => generateAlertsForCompany(companyId, t))
  }
  return generateInTx(tx, companyId)
}

async function generateInTx(tx: Tx, companyId: string): Promise<GenerateAlertsResult> {
  await tx.sql`SELECT pg_advisory_xact_lock(hashtext(${`${companyId}:alerts`}))`

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

  // 2. Péremption proche (30 jours) — par lot (ligne de stock)
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
      AND s.expiry_date <= CURRENT_DATE + 30
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

  return { alertsCreated, alertsResolved }
}
