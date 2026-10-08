import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { runCronJob } from '@/lib/cron-runs'
import { reconcilePendingRequests } from '@/lib/mobile-money/requests'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/reconcile-mobile-money — tâche planifiée (toutes les 10-15 min conseillé).
 * Relit chez GeniusPay le statut des demandes Mobile Money encore « en attente »
 * des entreprises clientes : couvre les webhooks perdus ou mal configurés.
 * Appel : Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  try {
    const summary = await runCronJob('reconcile-mobile-money', () => reconcilePendingRequests())
    return NextResponse.json({ success: true, ...summary })
  } catch (error) {
    console.error('[cron] reconcile-mobile-money', error)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
