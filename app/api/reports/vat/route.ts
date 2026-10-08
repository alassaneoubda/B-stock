import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { badRequest, handleRouteError } from '@/lib/errors'
import { defaultPeriod, isIsoDate } from '@/lib/domain/costing'
import { getVatReport } from '@/lib/domain/vat-report'

const isoDate = z.string().refine(isIsoDate, 'Date invalide (AAAA-MM-JJ)')

const querySchema = z.object({ from: isoDate.optional(), to: isoDate.optional() })

/**
 * GET /api/reports/vat?from=AAAA-MM-JJ&to=AAAA-MM-JJ
 * TVA collectée (ventes − retours) et TVA déductible (achats reçus avec un taux),
 * par taux, sur la période (défaut : mois en cours).
 */
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('reports.view')
    if (!authz.ok) return authz.response

    const { searchParams } = new URL(request.url)
    const q = querySchema.parse({
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
    })
    const period = defaultPeriod()
    const from = q.from ?? period.from
    const to = q.to ?? period.to
    if (from > to) throw badRequest('La date de début doit précéder la date de fin')

    return NextResponse.json({ success: true, data: await getVatReport(authz.companyId, { from, to }) })
  } catch (error) {
    return handleRouteError(error, 'reports.vat')
  }
}
