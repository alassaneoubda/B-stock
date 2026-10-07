import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { badRequest, handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'
import { defaultPeriod, getMarginReport, isIsoDate } from '@/lib/domain/costing'

const isoDate = z.string().refine(isIsoDate, 'Date invalide (AAAA-MM-JJ)')

const querySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  depotId: z.string().uuid().optional(),
})

/**
 * GET /api/reports/margin?from=AAAA-MM-JJ&to=AAAA-MM-JJ&depotId=…
 * Chiffre d'affaires, coût des ventes (coûts figés) et marge brute réelle,
 * au total et par mois, produit, client, commercial et dépôt.
 */
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('reports.view')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const q = querySchema.parse({
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      depotId: searchParams.get('depotId') || undefined,
    })
    const period = defaultPeriod()
    const from = q.from ?? period.from
    const to = q.to ?? period.to
    if (from > to) throw badRequest('La date de début doit précéder la date de fin')

    await assertOwned(sql, companyId, { depots: [q.depotId] })

    const report = await getMarginReport(companyId, { from, to, depotId: q.depotId })
    return NextResponse.json({ success: true, data: report })
  } catch (error) {
    return handleRouteError(error, 'reports.margin')
  }
}
