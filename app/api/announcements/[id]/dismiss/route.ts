import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { sql } from '@/lib/db'

// POST /api/announcements/:id/dismiss — hide an announcement for the current user
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireAuth({ skipSubscriptionCheck: true })
  if (!authz.ok) return authz.response
  const { session } = authz

  try {
    const { id } = await params
    await sql`
      INSERT INTO announcement_dismissals (announcement_id, user_id)
      VALUES (${id}, ${session.user.id})
      ON CONFLICT (announcement_id, user_id) DO NOTHING
    `
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('announcement dismiss error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
