import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'

const querySchema = z.object({
  depotId: z.string().uuid().optional(),
  /** Durée du cycle : chaque article est compté au moins une fois toutes les N semaines. */
  weeks: z.coerce.number().int().min(1).max(52).default(4),
})

/**
 * GET /api/inventory/due — « À compter cette semaine » (inventaire tournant).
 * Objectif hebdomadaire = nombre de variantes actives / durée du cycle ; la liste
 * propose les variantes les moins récemment comptées dans le dépôt (jamais comptées
 * d'abord), moins celles déjà comptées cette semaine.
 */
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('inventory.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const sp = new URL(request.url).searchParams
    const q = querySchema.parse({ depotId: sp.get('depotId') || undefined, weeks: sp.get('weeks') || undefined })

    let depotId = q.depotId
    if (depotId) {
      await assertOwned(sql, companyId, { depots: [depotId] })
    } else {
      const [main] = await sql`
        SELECT id FROM depots WHERE company_id = ${companyId} ORDER BY is_main DESC, created_at ASC LIMIT 1
      `
      if (!main) throw new AppError(409, 'Créez d’abord un dépôt', 'NO_DEPOT')
      depotId = main.id as string
    }

    const [stats] = await sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE cnt.last_counted_at >= date_trunc('week', NOW()))::int AS counted_this_week,
             COUNT(*) FILTER (WHERE cnt.last_counted_at IS NULL)::int AS never_counted
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN stock_counts cnt ON cnt.depot_id = ${depotId} AND cnt.product_variant_id = pv.id
      WHERE p.company_id = ${companyId} AND p.is_active = true
    `
    const total = Number(stats.total)
    const weeklyQuota = total === 0 ? 0 : Math.ceil(total / q.weeks)
    const remaining = Math.max(weeklyQuota - Number(stats.counted_this_week), 0)

    const items = remaining === 0
      ? []
      : await sql`
          SELECT pv.id AS variant_id, p.id AS product_id, p.name AS product_name, p.category, p.brand,
                 pt.name AS packaging_name,
                 COALESCE(st.qty, 0)::int AS quantity,
                 (COALESCE(st.qty, 0) * COALESCE(sc.avg_cost, pv.cost_price, 0))::float AS value,
                 cnt.last_counted_at
          FROM product_variants pv
          JOIN products p ON p.id = pv.product_id
          LEFT JOIN packaging_types pt ON pt.id = pv.packaging_type_id
          LEFT JOIN (
            SELECT product_variant_id, SUM(quantity) AS qty FROM stock
            WHERE depot_id = ${depotId} GROUP BY product_variant_id
          ) st ON st.product_variant_id = pv.id
          LEFT JOIN stock_costs sc ON sc.depot_id = ${depotId} AND sc.product_variant_id = pv.id
          LEFT JOIN stock_counts cnt ON cnt.depot_id = ${depotId} AND cnt.product_variant_id = pv.id
          WHERE p.company_id = ${companyId} AND p.is_active = true
            AND (cnt.last_counted_at IS NULL OR cnt.last_counted_at < date_trunc('week', NOW()))
          ORDER BY cnt.last_counted_at ASC NULLS FIRST, (COALESCE(st.qty, 0) > 0) DESC, p.name, pt.name, pv.id
          LIMIT ${remaining}
        `

    // Filtres proposés pour un inventaire partiel par catégorie ou par marque
    const facets = await sql`
      SELECT
        COALESCE(array_agg(DISTINCT p.category) FILTER (WHERE p.category IS NOT NULL AND p.category <> ''), '{}') AS categories,
        COALESCE(array_agg(DISTINCT p.brand) FILTER (WHERE p.brand IS NOT NULL AND p.brand <> ''), '{}') AS brands
      FROM products p
      WHERE p.company_id = ${companyId} AND p.is_active = true
    `

    return NextResponse.json({
      success: true,
      data: {
        depotId,
        cycleWeeks: q.weeks,
        totalVariants: total,
        neverCounted: Number(stats.never_counted),
        countedThisWeek: Number(stats.counted_this_week),
        weeklyQuota,
        items,
        categories: facets[0]?.categories ?? [],
        brands: facets[0]?.brands ?? [],
      },
    })
  } catch (error) {
    return handleRouteError(error, 'inventory.due')
  }
}
