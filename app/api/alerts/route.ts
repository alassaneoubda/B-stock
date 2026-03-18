import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/alerts — List alerts
export async function GET(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const unreadOnly = searchParams.get('unreadOnly') === 'true'

        let alerts
        if (unreadOnly) {
            alerts = await sql`
        SELECT * FROM alerts
        WHERE company_id = ${session.user.companyId}
          AND is_read = false
        ORDER BY created_at DESC
        LIMIT 50
      `
        } else {
            alerts = await sql`
        SELECT * FROM alerts
        WHERE company_id = ${session.user.companyId}
        ORDER BY created_at DESC
        LIMIT 100
      `
        }

        return NextResponse.json({ success: true, data: alerts })
    } catch (error) {
        console.error('Error fetching alerts:', error)
        return NextResponse.json({ error: 'Erreur lors de la récupération des alertes' }, { status: 500 })
    }
}

// PATCH /api/alerts — Mark alerts as read
export async function PATCH(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const body = await request.json()
        const { alertIds, markAllRead } = body

        if (markAllRead) {
            await sql`
        UPDATE alerts SET is_read = true
        WHERE company_id = ${session.user.companyId} AND is_read = false
      `
        } else if (alertIds && Array.isArray(alertIds)) {
            for (const id of alertIds) {
                await sql`
          UPDATE alerts SET is_read = true
          WHERE id = ${id} AND company_id = ${session.user.companyId}
        `
            }
        }

        return NextResponse.json({ success: true, message: 'Alertes marquées comme lues' })
    } catch (error) {
        console.error('Error updating alerts:', error)
        return NextResponse.json({ error: 'Erreur lors de la mise à jour des alertes' }, { status: 500 })
    }
}
