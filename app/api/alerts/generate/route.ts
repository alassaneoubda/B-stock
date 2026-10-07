import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { handleRouteError } from '@/lib/errors'
import { generateAlertsForCompany } from '@/lib/domain/alerts'

// POST /api/alerts/generate — Generate automatic alerts for the company
export async function POST() {
    try {
        const authz = await requirePermission('alerts.manage')
        if (!authz.ok) return authz.response

        const { alertsCreated, alertsResolved } = await generateAlertsForCompany(authz.companyId)

        return NextResponse.json({
            success: true,
            alertsCreated,
            alertsResolved,
            message: `${alertsCreated} nouvelle(s) alerte(s) générée(s)`,
        })
    } catch (error) {
        return handleRouteError(error, 'alerts.generate')
    }
}
