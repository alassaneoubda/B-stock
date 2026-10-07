import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { runCronJob } from '@/lib/cron-runs'
import { handleRouteError } from '@/lib/errors'
import { purgeScheduledDeletions } from '@/lib/admin/company-purge'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/purge-companies — tâche planifiée (1 fois par jour conseillé, la nuit).
 * Supprime définitivement les entreprises dont la suppression programmée (J+30) est échue.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  try {
    const summary = await runCronJob('purge-companies', purgeScheduledDeletions)
    return NextResponse.json({ success: true, ...summary })
  } catch (error) {
    return handleRouteError(error, 'cron.purge-companies')
  }
}
