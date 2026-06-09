import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin-auth'
import { sql } from '@/lib/db'

// GET /api/admin/webhooks — received webhook events (monitoring)
export async function GET(request: NextRequest) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') || '').trim()
    const status = searchParams.get('status') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = 30
    const offset = (page - 1) * limit
    const like = `%${search}%`

    const rows = await sql`
      SELECT id, provider, event_type, reference, signature_valid, status, error,
             created_at, processed_at
      FROM webhook_events
      WHERE
        (${search} = '' OR reference ILIKE ${like} OR event_type ILIKE ${like})
        AND (${status} = '' OR status = ${status})
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count
      FROM webhook_events
      WHERE
        (${search} = '' OR reference ILIKE ${like} OR event_type ILIKE ${like})
        AND (${status} = '' OR status = ${status})
    `

    const [summary] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'processed')::int AS processed,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE status = 'replayed')::int AS replayed,
        COUNT(*)::int AS total
      FROM webhook_events
    `

    return NextResponse.json({
      success: true,
      data: rows,
      summary,
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
    })
  } catch (e) {
    console.error('admin webhooks list error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
