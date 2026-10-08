import { sql } from '../db'
import { loadVatSettings, type VatSettings } from '../vat'

/**
 * Rapport « TVA » d'une période [from, to] (dates incluses, AAAA-MM-JJ),
 * à partir des montants FIGÉS sur les documents (cf. lib/vat.ts) :
 *
 * TVA collectée, par taux =
 *   + lignes des ventes non annulées datées de la période (amount_ht, vat_amount) ;
 *   − retours directs sur vente (/api/sales/[id]/return) de la période, au prorata
 *     des quantités (HT et TVA unitaires moyens de la ligne de vente d'origine) ;
 *   − retours clients traités (module Retours) de la période, lignes portant une
 *     TVA (return_items.vat_amount, figée au traitement avec le taux de la vente).
 *   Les ventes annulées sont exclues en totalité (leurs retours aussi).
 *
 * TVA déductible, par taux = réceptions d'achats de la période dont la ligne de
 * commande porte un taux (purchase_order_items.vat_rate, prix d'achat HT) :
 * quantités reçues × prix d'achat × taux, moins les retours fournisseurs.
 * Limite : seuls les achats saisis avec un taux sont pris en compte ; les
 * factures fournisseurs manuelles ne portent pas de TVA dans B-Stock.
 *
 * Les consignes d'emballage ne sont jamais soumises à la TVA.
 */

export type VatReportLine = { rate: number; base: number; vat: number }

export type VatReport = {
  from: string
  to: string
  settings: VatSettings
  collected: { byRate: VatReportLine[]; base: number; vat: number }
  deductible: { byRate: VatReportLine[]; base: number; vat: number }
  /** TVA collectée − TVA déductible (> 0 : à reverser). */
  net: number
}

const round = (n: number) => Math.round(n * 100) / 100

function merge(rows: { rate: string | number; base: string | number; vat: string | number }[]) {
  const map = new Map<number, VatReportLine>()
  for (const r of rows) {
    const rate = Number(r.rate)
    const g = map.get(rate) ?? { rate, base: 0, vat: 0 }
    g.base = round(g.base + Number(r.base))
    g.vat = round(g.vat + Number(r.vat))
    map.set(rate, g)
  }
  const byRate = [...map.values()]
    .map((g) => ({ rate: g.rate, base: Math.round(g.base), vat: Math.round(g.vat) }))
    .filter((g) => g.base !== 0 || g.vat !== 0)
    .sort((a, b) => b.rate - a.rate)
  return {
    byRate,
    base: byRate.reduce((s, g) => s + g.base, 0),
    vat: byRate.reduce((s, g) => s + g.vat, 0),
  }
}

export async function getVatReport(companyId: string, input: { from: string; to: string }): Promise<VatReport> {
  const { from, to } = input
  const settings = await loadVatSettings(sql, companyId)

  const collectedRows = await sql`
    -- Ventes
    SELECT soi.vat_rate AS rate, SUM(soi.amount_ht) AS base, SUM(soi.vat_amount) AS vat
    FROM sales_order_items soi
    JOIN sales_orders so ON so.id = soi.sales_order_id
    WHERE so.company_id = ${companyId} AND so.status <> 'cancelled'
      AND soi.vat_amount IS NOT NULL
      AND so.created_at >= ${from}::date AND so.created_at < ${to}::date + 1
    GROUP BY soi.vat_rate

    UNION ALL

    -- Retours directs sur vente
    SELECT l.rate, -SUM(sm.quantity * l.unit_ht), -SUM(sm.quantity * l.unit_vat)
    FROM stock_movements sm
    JOIN sales_orders so ON so.id = sm.reference_id AND so.company_id = sm.company_id
    JOIN LATERAL (
      SELECT MAX(i.vat_rate) AS rate,
             SUM(i.amount_ht) / NULLIF(SUM(i.quantity), 0) AS unit_ht,
             SUM(i.vat_amount) / NULLIF(SUM(i.quantity), 0) AS unit_vat
      FROM sales_order_items i
      WHERE i.sales_order_id = so.id AND i.product_variant_id = sm.product_variant_id
        AND i.vat_amount IS NOT NULL
    ) l ON l.rate IS NOT NULL
    WHERE sm.company_id = ${companyId} AND sm.movement_type = 'return'
      AND sm.reference_type = 'sales_order' AND sm.quantity > 0 AND so.status <> 'cancelled'
      AND sm.created_at >= ${from}::date AND sm.created_at < ${to}::date + 1
    GROUP BY l.rate

    UNION ALL

    -- Retours clients traités (module Retours)
    SELECT ri.vat_rate, -SUM(ri.amount_ht), -SUM(ri.vat_amount)
    FROM return_items ri
    JOIN returns r ON r.id = ri.return_id
    LEFT JOIN sales_orders so ON so.id = r.sales_order_id
    WHERE r.company_id = ${companyId} AND r.return_type = 'client' AND r.status = 'processed'
      AND ri.vat_amount IS NOT NULL AND (so.id IS NULL OR so.status <> 'cancelled')
      AND r.processed_at >= ${from}::date AND r.processed_at < ${to}::date + 1
    GROUP BY ri.vat_rate
  `

  const deductibleRows = await sql`
    SELECT l.rate,
           SUM(CASE WHEN sm.movement_type = 'purchase' THEN 1 ELSE -1 END * ABS(sm.quantity) * l.unit_price) AS base,
           SUM(CASE WHEN sm.movement_type = 'purchase' THEN 1 ELSE -1 END * ABS(sm.quantity) * l.unit_price * l.rate / 100) AS vat
    FROM stock_movements sm
    JOIN purchase_orders po ON po.id = sm.reference_id AND po.company_id = sm.company_id
    JOIN LATERAL (
      SELECT MAX(poi.vat_rate) AS rate,
             SUM(poi.unit_price * poi.quantity_ordered) / NULLIF(SUM(poi.quantity_ordered), 0) AS unit_price
      FROM purchase_order_items poi
      WHERE poi.purchase_order_id = po.id AND poi.product_variant_id = sm.product_variant_id
        AND poi.vat_rate IS NOT NULL AND poi.vat_rate > 0
    ) l ON l.rate IS NOT NULL
    WHERE sm.company_id = ${companyId} AND sm.reference_type = 'purchase_order'
      AND sm.movement_type IN ('purchase', 'return')
      AND sm.created_at >= ${from}::date AND sm.created_at < ${to}::date + 1
    GROUP BY l.rate
  `

  const collected = merge(collectedRows as any[])
  const deductible = merge(deductibleRows as any[])
  return { from, to, settings, collected, deductible, net: collected.vat - deductible.vat }
}
