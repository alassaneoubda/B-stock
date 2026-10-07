import type { CashQueryFn } from '../cash-automation'

/**
 * Suggestions de réapprovisionnement (« À commander »).
 *
 * Pour chaque couple (dépôt, variante) vendu sur la période ou présent en stock :
 *   ventes moyennes / jour = (ventes − annulations de vente) sur 28 jours ÷ 28
 *     (mouvements de stock 'sale', moins les 'return' référencés 'sales_order' :
 *      couvre les ventes classiques comme les tickets de caisse POS)
 *   jours de couverture    = stock disponible ÷ ventes moyennes / jour
 *   quantité suggérée      = ⌈ventes moyennes / jour × N jours − stock − déjà en commande⌉, minimum 0
 *     (« déjà en commande » : reste à recevoir des bons en attente / confirmés /
 *      partiellement reçus, pour ne pas commander deux fois)
 * Fournisseur proposé : celui du dernier bon de commande de la variante, avec
 * son dernier prix d'achat (à défaut, le prix d'achat de la variante).
 */

export const SALES_WINDOW_DAYS = 28
export const DEFAULT_COVERAGE_DAYS = 14

export type SuggestionRow = {
  depot_id: string
  depot_name: string
  product_variant_id: string
  product_name: string
  packaging_name: string | null
  sold_qty: number
  avg_daily_sales: number
  stock: number
  on_order: number
  coverage_days: number | null
  suggested_qty: number
  supplier_id: string | null
  supplier_name: string | null
  unit_price: number
}

export type SuggestionOptions = {
  coverageDays?: number
  depotId?: string | null
  supplierId?: string | null
  /** Inclure aussi les lignes sans quantité à commander. */
  includeAll?: boolean
}

export async function computePurchaseSuggestions(
  q: CashQueryFn,
  companyId: string,
  opts: SuggestionOptions = {}
): Promise<{ coverageDays: number; windowDays: number; rows: SuggestionRow[] }> {
  const coverageDays = opts.coverageDays ?? DEFAULT_COVERAGE_DAYS
  const depotId = opts.depotId ?? null
  const supplierId = opts.supplierId ?? null

  const raw = await q`
    WITH sales AS (
      SELECT sm.depot_id, sm.product_variant_id, SUM(-sm.quantity) AS sold
      FROM stock_movements sm
      WHERE sm.company_id = ${companyId}
        AND sm.created_at >= NOW() - make_interval(days => ${SALES_WINDOW_DAYS}::int)
        AND (
          sm.movement_type = 'sale'
          OR (sm.movement_type = 'return' AND sm.reference_type = 'sales_order')
        )
      GROUP BY sm.depot_id, sm.product_variant_id
    ),
    stock_levels AS (
      SELECT s.depot_id, s.product_variant_id, SUM(s.quantity) AS qty
      FROM stock s
      JOIN depots d ON d.id = s.depot_id AND d.company_id = ${companyId}
      GROUP BY s.depot_id, s.product_variant_id
    ),
    on_order AS (
      SELECT po.depot_id, poi.product_variant_id,
             SUM(GREATEST(poi.quantity_ordered - COALESCE(poi.quantity_received, 0) - COALESCE(poi.quantity_damaged, 0), 0)) AS qty
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.purchase_order_id
      WHERE po.company_id = ${companyId} AND po.status IN ('pending', 'confirmed', 'partial')
      GROUP BY po.depot_id, poi.product_variant_id
    ),
    last_purchase AS (
      SELECT DISTINCT ON (poi.product_variant_id)
             poi.product_variant_id, po.supplier_id, s.name AS supplier_name, poi.unit_price
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.purchase_order_id
      JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.company_id = ${companyId} AND po.status <> 'cancelled'
      ORDER BY poi.product_variant_id, po.ordered_at DESC, po.created_at DESC, po.id DESC
    ),
    pairs AS (
      SELECT depot_id, product_variant_id FROM sales
      UNION
      SELECT depot_id, product_variant_id FROM stock_levels
    )
    SELECT pr.depot_id, d.name AS depot_name, pr.product_variant_id,
           p.name AS product_name, pt.name AS packaging_name,
           GREATEST(COALESCE(sa.sold, 0), 0)::int AS sold_qty,
           GREATEST(COALESCE(sl.qty, 0), 0)::int AS stock,
           COALESCE(oo.qty, 0)::int AS on_order,
           lp.supplier_id, lp.supplier_name,
           COALESCE(lp.unit_price, pv.cost_price, 0)::float8 AS unit_price
    FROM pairs pr
    JOIN depots d ON d.id = pr.depot_id AND d.company_id = ${companyId}
    JOIN product_variants pv ON pv.id = pr.product_variant_id
    JOIN products p ON p.id = pv.product_id AND p.company_id = ${companyId}
    LEFT JOIN packaging_types pt ON pt.id = pv.packaging_type_id
    LEFT JOIN sales sa ON sa.depot_id = pr.depot_id AND sa.product_variant_id = pr.product_variant_id
    LEFT JOIN stock_levels sl ON sl.depot_id = pr.depot_id AND sl.product_variant_id = pr.product_variant_id
    LEFT JOIN on_order oo ON oo.depot_id = pr.depot_id AND oo.product_variant_id = pr.product_variant_id
    LEFT JOIN last_purchase lp ON lp.product_variant_id = pr.product_variant_id
    WHERE COALESCE(p.is_active, true) = true
      AND (${depotId}::uuid IS NULL OR pr.depot_id = ${depotId}::uuid)
      AND (${supplierId}::uuid IS NULL OR lp.supplier_id = ${supplierId}::uuid)
    ORDER BY d.name, p.name, pt.name NULLS FIRST, pr.product_variant_id
  `

  const rows: SuggestionRow[] = raw.map((r) => {
    const sold = Number(r.sold_qty)
    const stock = Number(r.stock)
    const onOrder = Number(r.on_order)
    const avg = sold / SALES_WINDOW_DAYS
    const suggested = avg > 0 ? Math.max(0, Math.ceil(avg * coverageDays - stock - onOrder - 1e-9)) : 0
    return {
      depot_id: r.depot_id,
      depot_name: r.depot_name,
      product_variant_id: r.product_variant_id,
      product_name: r.product_name,
      packaging_name: r.packaging_name,
      sold_qty: sold,
      avg_daily_sales: Math.round(avg * 100) / 100,
      stock,
      on_order: onOrder,
      coverage_days: avg > 0 ? Math.round((stock / avg) * 10) / 10 : null,
      suggested_qty: suggested,
      supplier_id: r.supplier_id ?? null,
      supplier_name: r.supplier_name ?? null,
      unit_price: Number(r.unit_price) || 0,
    }
  })

  return {
    coverageDays,
    windowDays: SALES_WINDOW_DAYS,
    rows: opts.includeAll
      ? rows
      : rows
          .filter((r) => r.suggested_qty > 0)
          .sort((a, b) => (a.coverage_days ?? Infinity) - (b.coverage_days ?? Infinity)),
  }
}
