import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { handleRouteError } from '@/lib/errors'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/admin/billing/reminders — relances d'échéance des 30 derniers jours
export async function GET() {
  const authz = await requireAdmin('billing.read')
  if (!authz.ok) return authz.response
  try {
    const rows = await sql`
      SELECT r.id, r.kind, to_char(r.period_end, 'YYYY-MM-DD') AS period_end, r.channel, r.status, r.error, r.created_at,
             c.id AS company_id, c.name AS company_name
      FROM subscription_reminders r
      JOIN companies c ON c.id = r.company_id
      WHERE r.created_at >= NOW() - INTERVAL '30 days'
      ORDER BY r.created_at DESC
      LIMIT 20
    `
    const [counts] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
        COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM subscription_reminders WHERE created_at >= NOW() - INTERVAL '30 days'
    `
    return NextResponse.json({ success: true, data: rows, counts })
  } catch (e) {
    return handleRouteError(e, 'admin billing reminders')
  }
}
