import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'
import { computePurchaseSuggestions, DEFAULT_COVERAGE_DAYS } from '@/lib/domain/purchase-suggestions'

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(180).default(DEFAULT_COVERAGE_DAYS),
  depotId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  all: z.enum(['0', '1', 'true', 'false']).optional(),
})

// GET /api/procurement/suggestions?days=14&depotId=&supplierId=&all=1 — quantités à commander
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('purchases.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const query = querySchema.parse({
      days: searchParams.get('days') || undefined,
      depotId: searchParams.get('depotId') || undefined,
      supplierId: searchParams.get('supplierId') || undefined,
      all: searchParams.get('all') || undefined,
    })
    await assertOwned(sql, companyId, { depots: [query.depotId], suppliers: [query.supplierId] })

    const result = await computePurchaseSuggestions(sql, companyId, {
      coverageDays: query.days,
      depotId: query.depotId ?? null,
      supplierId: query.supplierId ?? null,
      includeAll: query.all === '1' || query.all === 'true',
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    return handleRouteError(error, 'procurement.suggestions')
  }
}
