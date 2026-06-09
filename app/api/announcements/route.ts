import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { sql } from '@/lib/db'

// GET /api/announcements — active announcements targeting the current user/company
export async function GET() {
  const authz = await requireAuth()
  if (!authz.ok) return authz.response
  const { session } = authz

  try {
    const companyId = session.user.companyId
    const userId = session.user.id

    const rows = await sql`
      SELECT a.id, a.title, a.body, a.level, a.dismissible, a.created_at
      FROM announcements a
      WHERE a.is_active = true
        AND (a.starts_at IS NULL OR a.starts_at <= NOW())
        AND (a.ends_at IS NULL OR a.ends_at >= NOW())
        AND (
          a.audience = 'all'
          OR (a.audience = 'company' AND a.target_company_id = ${companyId})
          OR (a.audience = 'status' AND a.target_status = (
                SELECT subscription_status FROM companies WHERE id = ${companyId}
              ))
        )
        AND NOT EXISTS (
          SELECT 1 FROM announcement_dismissals d
          WHERE d.announcement_id = a.id AND d.user_id = ${userId}
        )
      ORDER BY
        CASE a.level WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'success' THEN 2 ELSE 3 END,
        a.created_at DESC
    `
    return NextResponse.json({ success: true, data: rows })
  } catch (e) {
    console.error('announcements fetch error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
