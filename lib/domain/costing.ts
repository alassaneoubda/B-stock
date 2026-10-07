import { sql } from '../db'

/**
 * Rapports de gestion fondés sur les coûts figés (coût moyen pondéré).
 *
 * Marge brute réelle = chiffre d'affaires net − coût des ventes, où :
 * - chiffre d'affaires = lignes de vente non annulées (prix réellement facturé),
 *   moins les retours clients (au prix de la vente d'origine) ;
 * - coût des ventes = quantité × coût de revient figé sur chaque ligne de vente
 *   (sales_order_items.unit_cost), moins le coût des marchandises réintégrées
 *   en stock par les retours. Un retour endommagé (non remis en stock) réduit le
 *   chiffre d'affaires sans réduire le coût : c'est une perte réelle.
 *
 * Valeur du stock :
 * - actuelle = Σ quantité × CMP du dépôt ;
 * - à une date passée = valeur actuelle − Σ (quantité × coût figé) des mouvements
 *   postérieurs à cette date. Chaque mouvement porte son coût (entrée : coût
 *   d'entrée ; sortie : CMP du moment), la reconstitution est donc exacte.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export type MarginTotals = {
  quantity: number
  revenue: number
  cost: number
  margin: number
  /** Taux de marge sur chiffre d'affaires (marge / CA), en %. null si CA nul. */
  rate: number | null
  /** Lignes dont le coût de revient est inconnu (comptées à 0). */
  missingCost: number
}

export type MarginGroup = MarginTotals & { key: string; label: string; sublabel?: string | null }

export type MarginReport = {
  from: string
  to: string
  depotId: string | null
  totals: MarginTotals
  byMonth: MarginGroup[]
  byProduct: MarginGroup[]
  byClient: MarginGroup[]
  byAgent: MarginGroup[]
  byDepot: MarginGroup[]
}

type MarginRow = {
  variant_id: string
  product_name: string | null
  packaging_name: string | null
  client_id: string | null
  client_name: string | null
  agent_id: string | null
  agent_name: string | null
  depot_id: string | null
  depot_name: string | null
  month: string
  qty: string
  revenue: string
  cost: string
  missing: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

function emptyTotals(): MarginTotals {
  return { quantity: 0, revenue: 0, cost: 0, margin: 0, rate: null, missingCost: 0 }
}

function finalize<T extends MarginTotals>(t: T): T {
  t.revenue = round2(t.revenue)
  t.cost = round2(t.cost)
  t.margin = round2(t.revenue - t.cost)
  t.rate = t.revenue !== 0 ? Math.round((t.margin / t.revenue) * 1000) / 10 : null
  return t
}

function groupBy(rows: MarginRow[], pick: (r: MarginRow) => { key: string; label: string; sublabel?: string | null }) {
  const map = new Map<string, MarginGroup>()
  for (const r of rows) {
    const k = pick(r)
    let g = map.get(k.key)
    if (!g) {
      g = { ...emptyTotals(), ...k }
      map.set(k.key, g)
    }
    g.quantity += Number(r.qty)
    g.revenue += Number(r.revenue)
    g.cost += Number(r.cost)
    g.missingCost += Number(r.missing)
  }
  return [...map.values()].map(finalize)
}

/**
 * Marge brute réelle sur une période [from, to] (dates incluses, AAAA-MM-JJ),
 * éventuellement limitée à un dépôt.
 */
export async function getMarginReport(
  companyId: string,
  input: { from: string; to: string; depotId?: string | null }
): Promise<MarginReport> {
  const depotId = input.depotId || null
  const rows = (await sql`
    WITH lines AS (
      -- Ventes non annulées : coût figé à la vente
      SELECT so.created_at AS at, so.depot_id, so.client_id, so.agent_id, soi.product_variant_id AS variant_id,
             soi.quantity::numeric AS qty,
             COALESCE(soi.total_price, soi.quantity * soi.unit_price, 0)::numeric AS revenue,
             (soi.quantity * soi.unit_cost)::numeric AS cost,
             (soi.unit_cost IS NULL) AS missing
      FROM sales_order_items soi
      JOIN sales_orders so ON so.id = soi.sales_order_id
      WHERE so.company_id = ${companyId} AND so.status <> 'cancelled'

      UNION ALL

      -- Retours directs sur une vente : prix moyen de la vente, coût de réintégration
      SELECT sm.created_at, so.depot_id, so.client_id, so.agent_id, sm.product_variant_id,
             -sm.quantity::numeric,
             -(sm.quantity * COALESCE(sp.avg_price, 0))::numeric,
             -(sm.quantity * sm.unit_cost)::numeric,
             (sm.unit_cost IS NULL)
      FROM stock_movements sm
      JOIN sales_orders so ON so.id = sm.reference_id AND so.company_id = sm.company_id
      LEFT JOIN LATERAL (
        SELECT SUM(COALESCE(i.total_price, i.quantity * i.unit_price)) / NULLIF(SUM(i.quantity), 0) AS avg_price
        FROM sales_order_items i
        WHERE i.sales_order_id = so.id AND i.product_variant_id = sm.product_variant_id
      ) sp ON true
      WHERE sm.company_id = ${companyId} AND sm.movement_type = 'return'
        AND sm.reference_type = 'sales_order' AND sm.quantity > 0 AND so.status <> 'cancelled'

      UNION ALL

      -- Retours clients traités (module Retours) : seuls les articles remis en stock réduisent le coût
      SELECT r.processed_at, r.depot_id, r.client_id, so.agent_id, ri.product_variant_id,
             -ri.quantity::numeric,
             -COALESCE(ri.total_price, ri.quantity * ri.unit_price, 0)::numeric,
             CASE WHEN ri.condition = 'good' THEN -(ri.quantity * rc.unit_cost) ELSE 0 END::numeric,
             (ri.condition = 'good' AND rc.unit_cost IS NULL)
      FROM return_items ri
      JOIN returns r ON r.id = ri.return_id
      LEFT JOIN sales_orders so ON so.id = r.sales_order_id
      LEFT JOIN LATERAL (
        SELECT SUM(m.quantity * m.unit_cost) / NULLIF(SUM(m.quantity), 0) AS unit_cost
        FROM stock_movements m
        WHERE m.company_id = r.company_id AND m.reference_type = 'return' AND m.reference_id = r.id
          AND m.product_variant_id = ri.product_variant_id AND m.quantity > 0
      ) rc ON true
      WHERE r.company_id = ${companyId} AND r.return_type = 'client' AND r.status = 'processed'
        AND ri.product_variant_id IS NOT NULL AND COALESCE(ri.item_type, 'product') = 'product'
        AND (so.id IS NULL OR so.status <> 'cancelled')
    )
    SELECT l.variant_id, p.name AS product_name, pt.name AS packaging_name,
           l.client_id, c.name AS client_name,
           l.agent_id, a.full_name AS agent_name,
           l.depot_id, d.name AS depot_name,
           TO_CHAR(DATE_TRUNC('month', l.at), 'YYYY-MM') AS month,
           SUM(l.qty) AS qty, SUM(l.revenue) AS revenue, SUM(COALESCE(l.cost, 0)) AS cost,
           COUNT(*) FILTER (WHERE l.missing)::int AS missing
    FROM lines l
    LEFT JOIN product_variants pv ON pv.id = l.variant_id
    LEFT JOIN products p ON p.id = pv.product_id
    LEFT JOIN packaging_types pt ON pt.id = pv.packaging_type_id
    LEFT JOIN clients c ON c.id = l.client_id
    LEFT JOIN sales_agents a ON a.id = l.agent_id
    LEFT JOIN depots d ON d.id = l.depot_id
    WHERE l.at >= ${input.from}::date AND l.at < ${input.to}::date + 1
      AND (${depotId}::uuid IS NULL OR l.depot_id = ${depotId}::uuid)
    GROUP BY l.variant_id, p.name, pt.name, l.client_id, c.name, l.agent_id, a.full_name,
             l.depot_id, d.name, DATE_TRUNC('month', l.at)
  `) as MarginRow[]

  const totals = finalize(
    rows.reduce((t, r) => {
      t.quantity += Number(r.qty)
      t.revenue += Number(r.revenue)
      t.cost += Number(r.cost)
      t.missingCost += Number(r.missing)
      return t
    }, emptyTotals())
  )

  const byMargin = (a: MarginGroup, b: MarginGroup) => b.margin - a.margin || b.revenue - a.revenue

  return {
    from: input.from,
    to: input.to,
    depotId,
    totals,
    byMonth: groupBy(rows, (r) => ({ key: r.month, label: r.month })).sort((a, b) => a.key.localeCompare(b.key)),
    byProduct: groupBy(rows, (r) => ({
      key: r.variant_id,
      label: r.product_name ?? 'Produit supprimé',
      sublabel: r.packaging_name,
    })).sort(byMargin),
    byClient: groupBy(rows, (r) => ({ key: r.client_id ?? 'none', label: r.client_name ?? 'Sans client' })).sort(byMargin),
    byAgent: groupBy(rows, (r) => ({ key: r.agent_id ?? 'none', label: r.agent_name ?? 'Sans commercial' })).sort(byMargin),
    byDepot: groupBy(rows, (r) => ({ key: r.depot_id ?? 'none', label: r.depot_name ?? 'Sans dépôt' })).sort(byMargin),
  }
}

// ---------------------------------------------------------------------------
// Valeur du stock
// ---------------------------------------------------------------------------

export type StockValuationLine = {
  depotId: string
  depotName: string
  variantId: string
  productName: string
  packagingName: string | null
  quantity: number
  value: number
  /** Coût unitaire moyen correspondant (valeur / quantité). */
  unitCost: number | null
}

export type StockValuation = {
  /** Date de valorisation (fin de journée, AAAA-MM-JJ) ; null = maintenant. */
  at: string | null
  depotId: string | null
  totalQuantity: number
  totalValue: number
  byDepot: { depotId: string; depotName: string; quantity: number; value: number }[]
  lines: StockValuationLine[]
}

type ValuationRow = {
  depot_id: string
  depot_name: string
  variant_id: string
  product_name: string
  packaging_name: string | null
  qty: string
  value: string
}

/**
 * Valeur du stock au CMP, maintenant ou à la fin d'une journée passée
 * (ex. bilan au 31 décembre : at = 'AAAA-12-31').
 */
export async function getStockValuation(
  companyId: string,
  input: { at?: string | null; depotId?: string | null } = {}
): Promise<StockValuation> {
  const at = input.at || null
  const depotId = input.depotId || null
  const rows = (await sql`
    WITH cur AS (
      SELECT s.depot_id, s.product_variant_id,
             SUM(s.quantity)::numeric AS qty
      FROM stock s
      JOIN depots d ON d.id = s.depot_id
      WHERE d.company_id = ${companyId}
        AND (${depotId}::uuid IS NULL OR s.depot_id = ${depotId}::uuid)
      GROUP BY s.depot_id, s.product_variant_id
    ),
    cur_value AS (
      SELECT cur.depot_id, cur.product_variant_id, cur.qty,
             cur.qty * COALESCE(sc.avg_cost, pv.cost_price, 0) AS value
      FROM cur
      JOIN product_variants pv ON pv.id = cur.product_variant_id
      LEFT JOIN stock_costs sc ON sc.depot_id = cur.depot_id AND sc.product_variant_id = cur.product_variant_id
    ),
    later AS (
      -- Mouvements postérieurs à la date : on les « défait » pour revenir à la date
      SELECT sm.depot_id, sm.product_variant_id,
             SUM(sm.quantity)::numeric AS qty,
             SUM(sm.quantity * COALESCE(sm.unit_cost, pv.cost_price, 0)) AS value
      FROM stock_movements sm
      JOIN product_variants pv ON pv.id = sm.product_variant_id
      WHERE ${at}::date IS NOT NULL
        AND sm.company_id = ${companyId}
        AND sm.created_at >= ${at}::date + 1
        AND (${depotId}::uuid IS NULL OR sm.depot_id = ${depotId}::uuid)
      GROUP BY sm.depot_id, sm.product_variant_id
    ),
    merged AS (
      SELECT COALESCE(c.depot_id, l.depot_id) AS depot_id,
             COALESCE(c.product_variant_id, l.product_variant_id) AS variant_id,
             COALESCE(c.qty, 0) - COALESCE(l.qty, 0) AS qty,
             COALESCE(c.value, 0) - COALESCE(l.value, 0) AS value
      FROM cur_value c
      FULL OUTER JOIN later l ON l.depot_id = c.depot_id AND l.product_variant_id = c.product_variant_id
    )
    SELECT m.depot_id, d.name AS depot_name, m.variant_id, p.name AS product_name, pt.name AS packaging_name,
           m.qty, ROUND(m.value, 2) AS value
    FROM merged m
    JOIN depots d ON d.id = m.depot_id AND d.company_id = ${companyId}
    JOIN product_variants pv ON pv.id = m.variant_id
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN packaging_types pt ON pt.id = pv.packaging_type_id
    WHERE m.qty <> 0 OR ROUND(m.value, 2) <> 0
    ORDER BY m.value DESC, p.name
  `) as ValuationRow[]

  const lines: StockValuationLine[] = rows.map((r) => {
    const quantity = Number(r.qty)
    const value = Number(r.value)
    return {
      depotId: r.depot_id,
      depotName: r.depot_name,
      variantId: r.variant_id,
      productName: r.product_name,
      packagingName: r.packaging_name,
      quantity,
      value,
      unitCost: quantity > 0 ? Math.round((value / quantity) * 100) / 100 : null,
    }
  })

  const depots = new Map<string, { depotId: string; depotName: string; quantity: number; value: number }>()
  for (const l of lines) {
    const d = depots.get(l.depotId) ?? { depotId: l.depotId, depotName: l.depotName, quantity: 0, value: 0 }
    d.quantity += l.quantity
    d.value = round2(d.value + l.value)
    depots.set(l.depotId, d)
  }

  return {
    at,
    depotId,
    totalQuantity: lines.reduce((s, l) => s + l.quantity, 0),
    totalValue: round2(lines.reduce((s, l) => s + l.value, 0)),
    byDepot: [...depots.values()].sort((a, b) => b.value - a.value),
    lines,
  }
}

/** Date du jour « AAAA-MM-JJ » (Côte d'Ivoire : GMT, identique à l'UTC). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Période par défaut des rapports : du 1er du mois en cours à aujourd'hui. */
export function defaultPeriod(): { from: string; to: string } {
  const to = todayIso()
  return { from: `${to.slice(0, 8)}01`, to }
}
