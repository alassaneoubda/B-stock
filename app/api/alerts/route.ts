import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { badRequest, handleRouteError } from '@/lib/errors'

const patchSchema = z.object({
    alertIds: z.array(z.string().uuid()).max(500).optional(),
    markAllRead: z.boolean().optional(),
})

// GET /api/alerts — List alerts (?unreadOnly=true, ?limit, ?offset)
export async function GET(request: NextRequest) {
    try {
        const authz = await requirePermission('alerts.read')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { searchParams } = new URL(request.url)
        const unreadOnly = searchParams.get('unreadOnly') === 'true'
        const rawLimit = Number.parseInt(searchParams.get('limit') ?? '', 10)
        const rawOffset = Number.parseInt(searchParams.get('offset') ?? '', 10)
        // Défauts historiques : 50 non lues / 100 toutes
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : unreadOnly ? 50 : 100
        const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0

        const alerts = await sql`
            SELECT * FROM alerts
            WHERE company_id = ${companyId}
              AND (${unreadOnly}::boolean = false OR is_read = false)
            ORDER BY created_at DESC, id
            LIMIT ${limit} OFFSET ${offset}
        `

        return NextResponse.json({ success: true, data: alerts })
    } catch (error) {
        return handleRouteError(error, 'alerts.list')
    }
}

// PATCH /api/alerts — Mark alerts as read
export async function PATCH(request: NextRequest) {
    try {
        const authz = await requirePermission('alerts.manage')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { alertIds, markAllRead } = patchSchema.parse(await request.json())

        if (markAllRead) {
            await sql`
                UPDATE alerts SET is_read = true
                WHERE company_id = ${companyId} AND is_read = false
            `
        } else if (alertIds && alertIds.length > 0) {
            await sql`
                UPDATE alerts SET is_read = true
                WHERE id = ANY(${alertIds}::uuid[]) AND company_id = ${companyId}
            `
        } else {
            throw badRequest('alertIds ou markAllRead requis')
        }

        return NextResponse.json({ success: true, message: 'Alertes marquées comme lues' })
    } catch (error) {
        return handleRouteError(error, 'alerts.markRead')
    }
}
