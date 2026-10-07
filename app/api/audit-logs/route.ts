import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'

const querySchema = z.object({
  entity_type: z.string().max(50).nullable(),
  user_id: z.string().uuid().nullable(),
  action: z.string().max(50).nullable(),
})

// GET /api/audit-logs — List audit logs (?entity_type, ?user_id, ?action, ?limit, ?offset)
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('audit.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const filters = querySchema.parse({
      entity_type: searchParams.get('entity_type') || null,
      user_id: searchParams.get('user_id') || null,
      action: searchParams.get('action') || null,
    })
    const rawLimit = Number.parseInt(searchParams.get('limit') ?? '', 10)
    const rawOffset = Number.parseInt(searchParams.get('offset') ?? '', 10)
    // Défaut historique de l'écran : 50 ; max 500
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 50
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0

    const logs = await sql`
      SELECT al.*, u.full_name AS user_name, u.role AS user_role
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id AND u.company_id = al.company_id
      WHERE al.company_id = ${companyId}
        AND (${filters.entity_type}::text IS NULL OR al.entity_type = ${filters.entity_type}::text)
        AND (${filters.user_id}::uuid IS NULL OR al.user_id = ${filters.user_id}::uuid)
        AND (${filters.action}::text IS NULL OR al.action = ${filters.action}::text)
      ORDER BY al.created_at DESC, al.id
      LIMIT ${limit} OFFSET ${offset}
    `

    return NextResponse.json({ success: true, data: logs })
  } catch (error) {
    return handleRouteError(error, 'audit-logs.list')
  }
}
