import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { handleRouteError } from '@/lib/errors'
import { computeBillingMetrics } from '@/lib/billing-admin'

export const dynamic = 'force-dynamic'

// GET /api/admin/billing/metrics — MRR, ARR, revenu mensuel, conversion, churn, ARPA
// (formules documentées dans lib/billing-admin.ts › computeBillingMetrics)
export async function GET() {
  const authz = await requireAdmin('billing.read')
  if (!authz.ok) return authz.response
  try {
    const metrics = await computeBillingMetrics()
    return NextResponse.json({ success: true, data: metrics })
  } catch (e) {
    return handleRouteError(e, 'admin billing metrics')
  }
}
