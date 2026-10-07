import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { runCronJob } from '@/lib/cron-runs'
import { sendSubscriptionReminders } from '@/lib/subscription-reminders'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/subscription-reminders — tâche planifiée (1 fois par jour conseillé, le matin).
 * Relance les propriétaires dont l'essai/abonnement se termine dans 7 j, 3 j, aujourd'hui ou hier.
 * Idempotent : une relance par palier et par échéance.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  try {
    const summary = await runCronJob('subscription-reminders', sendSubscriptionReminders)
    return NextResponse.json({ success: true, ...summary })
  } catch (error) {
    console.error('[cron] subscription-reminders', error)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
