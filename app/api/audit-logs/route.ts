import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/audit-logs — List audit logs
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entity_type')
    const userId = searchParams.get('user_id')
    const action = searchParams.get('action')
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200)

    const logs = await sql`
      SELECT al.*, u.full_name as user_name, u.role as user_role
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.company_id = ${companyId}
        ${entityType ? sql`AND al.entity_type = ${entityType}` : sql``}
        ${userId ? sql`AND al.user_id = ${userId}` : sql``}
        ${action ? sql`AND al.action = ${action}` : sql``}
      ORDER BY al.created_at DESC
      LIMIT ${limit}
    `

    return NextResponse.json({ success: true, data: logs })
  } catch (error) {
    console.error('Audit logs error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
