import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { badRequest, handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'
import { getStockValuation, isIsoDate, todayIso } from '@/lib/domain/costing'

const querySchema = z.object({
  at: z.string().refine(isIsoDate, 'Date invalide (AAAA-MM-JJ)').optional(),
  depotId: z.string().uuid().optional(),
})

/**
 * GET /api/reports/stock-value?at=AAAA-MM-JJ&depotId=…
 * Valeur du stock au coût moyen pondéré : actuelle, ou à la fin de la journée
 * `at` (reconstituée à partir des mouvements et de leurs coûts figés).
 */
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('reports.view')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const q = querySchema.parse({
      at: searchParams.get('at') || undefined,
      depotId: searchParams.get('depotId') || undefined,
    })
    if (q.at && q.at > todayIso()) throw badRequest('La date de valorisation ne peut pas être dans le futur')

    await assertOwned(sql, companyId, { depots: [q.depotId] })

    const valuation = await getStockValuation(companyId, { at: q.at ?? null, depotId: q.depotId })
    return NextResponse.json({ success: true, data: valuation })
  } catch (error) {
    return handleRouteError(error, 'reports.stock_value')
  }
}
