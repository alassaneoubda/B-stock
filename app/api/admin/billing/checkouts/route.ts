import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { handleRouteError } from '@/lib/errors'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/admin/billing/checkouts?status=pending — paiements en ligne initiés (GeniusPay)
export async function GET(request: NextRequest) {
  const authz = await requireAdmin('billing.read')
  if (!authz.ok) return authz.response
  try {
    const raw = new URL(request.url).searchParams.get('status') || 'pending'
    const status = ['pending', 'completed', 'failed', 'expired'].includes(raw) ? raw : 'pending'
    const rows = await sql`
      SELECT sc.id, sc.reference, sc.plan_id, sc.plan_name, sc.billing_interval, sc.months, sc.amount, sc.currency,
             sc.status, sc.provider_status, sc.check_attempts, sc.last_checked_at, sc.created_at,
             c.id AS company_id, c.name AS company_name
      FROM subscription_checkouts sc
      JOIN companies c ON c.id = sc.company_id
      WHERE sc.status = ${status}
      ORDER BY sc.created_at DESC
      LIMIT 100
    `
    return NextResponse.json({ success: true, data: rows })
  } catch (e) {
    return handleRouteError(e, 'admin billing checkouts')
  }
}
