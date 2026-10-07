import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { handleRouteError } from '@/lib/errors'
import { getAvailability } from '@/lib/mobile-money/settings'

// GET /api/payments/mobile-money/config — la fonctionnalité est-elle utilisable ? (aucun secret)
export async function GET() {
  try {
    const authz = await requirePermission('payments.read')
    if (!authz.ok) return authz.response
    return NextResponse.json({ success: true, data: await getAvailability(authz.companyId) })
  } catch (error) {
    return handleRouteError(error, 'mobile-money.config')
  }
}
