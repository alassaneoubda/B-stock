import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { reconcilePendingCheckouts } from '@/lib/subscription-checkout'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/reconcile-payments — tâche planifiée (toutes les 15 min conseillé).
 * Rapproche les paiements d'abonnement restés « en attente » avec GeniusPay :
 * couvre le webhook perdu et le client qui ferme l'onglet avant le retour.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  try {
    const summary = await reconcilePendingCheckouts()
    return NextResponse.json({ success: true, ...summary })
  } catch (error) {
    console.error('[cron] reconcile-payments', error)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
