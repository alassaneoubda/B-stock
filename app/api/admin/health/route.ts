import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { isGeniusPayConfigured } from '@/lib/geniuspay'
import { isEmailConfigured } from '@/lib/email'

export const dynamic = 'force-dynamic'

export type HealthStatus = 'ok' | 'warning' | 'error'

export type HealthCheck = {
  id: string
  label: string
  status: HealthStatus
  value: string
  hint: string
}

export type HealthJob = {
  job: string
  label: string
  status: HealthStatus
  lastRunAt: string | null
  lastRunStatus: string | null
  lastSuccessAt: string | null
  ageMinutes: number | null
  error: string | null
  hint: string
}

/** Tâches planifiées suivies (nom utilisé dans runCronJob). */
const JOBS: { job: string; label: string }[] = [
  { job: 'reconcile-payments', label: 'Rapprochement des paiements' },
  { job: 'subscription-reminders', label: 'Relances d’échéance' },
  { job: 'purge-companies', label: 'Purge des entreprises supprimées' },
]

/** Une tâche sans exécution réussie depuis 26 h est signalée. */
const JOB_STALE_HOURS = 26
const GENIUSPAY_TIMEOUT_MS = 5000

const nf = new Intl.NumberFormat('fr-FR')
const fmt = (n: unknown) => nf.format(Number(n) || 0)

function worst(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes('error')) return 'error'
  if (statuses.includes('warning')) return 'warning'
  return 'ok'
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

async function checkDatabase(): Promise<HealthCheck> {
  try {
    const started = performance.now()
    await sql`SELECT 1`
    const latency = Math.round(performance.now() - started)
    const [counts] = await sql`
      SELECT
        (SELECT COUNT(*) FROM companies)::bigint AS companies,
        (SELECT COUNT(*) FROM sales_orders)::bigint AS sales_orders,
        (SELECT COUNT(*) FROM stock_movements)::bigint AS stock_movements
    `
    const status: HealthStatus = latency > 1000 ? 'error' : latency > 300 ? 'warning' : 'ok'
    return {
      id: 'database',
      label: 'Base de données',
      status,
      value: `Connectée · ${latency} ms`,
      hint:
        `${fmt(counts.companies)} entreprises · ${fmt(counts.sales_orders)} ventes · ${fmt(counts.stock_movements)} mouvements de stock` +
        (status === 'ok' ? '' : ' — latence élevée'),
    }
  } catch (e) {
    return {
      id: 'database',
      label: 'Base de données',
      status: 'error',
      value: 'Injoignable',
      hint: `Connexion impossible : ${errorText(e)}`,
    }
  }
}

async function checkGeniusPay(): Promise<HealthCheck> {
  const configured = isGeniusPayConfigured()
  const baseUrl = process.env.GENIUSPAY_BASE_URL || 'https://pay.genius.ci/api/v1/merchant'
  let reachable = false
  let detail = ''
  try {
    // Toute réponse HTTP (même 401/404) prouve que le service répond
    const res = await fetch(baseUrl, {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(GENIUSPAY_TIMEOUT_MS),
    })
    reachable = true
    detail = `HTTP ${res.status}`
  } catch (e) {
    detail = (e as Error)?.name === 'TimeoutError' ? 'délai de 5 s dépassé' : errorText(e)
  }

  if (!reachable) {
    return {
      id: 'geniuspay',
      label: 'GeniusPay',
      status: 'error',
      value: configured ? 'Configuré · injoignable' : 'Non configuré · injoignable',
      hint: `Le service de paiement ne répond pas (${detail}).`,
    }
  }
  if (!configured) {
    return {
      id: 'geniuspay',
      label: 'GeniusPay',
      status: 'warning',
      value: 'Non configuré · joignable',
      hint: 'GENIUSPAY_API_KEY / GENIUSPAY_API_SECRET absents : les paiements en ligne sont impossibles.',
    }
  }
  return {
    id: 'geniuspay',
    label: 'GeniusPay',
    status: 'ok',
    value: 'Configuré · joignable',
    hint: `Le service répond (${detail}).`,
  }
}

function checkEmail(): HealthCheck {
  const ok = isEmailConfigured()
  return {
    id: 'email',
    label: 'E-mails (Resend)',
    status: ok ? 'ok' : 'warning',
    value: ok ? 'Configuré' : 'Non configuré',
    hint: ok
      ? 'Les e-mails transactionnels (relances, réinitialisations) sont envoyés.'
      : 'RESEND_API_KEY / EMAIL_FROM absents : aucun e-mail n’est envoyé.',
  }
}

function checkRateLimit(): HealthCheck {
  const ok = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  return {
    id: 'rate_limit',
    label: 'Limitation de débit',
    status: ok ? 'ok' : 'warning',
    value: ok ? 'Upstash Redis' : 'En mémoire',
    hint: ok
      ? 'Compteur partagé entre toutes les instances.'
      : 'Limite en mémoire, insuffisant en production (configurez UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN).',
  }
}

function checkCronSecret(): HealthCheck {
  const secret = process.env.CRON_SECRET
  const ok = Boolean(secret && secret.length >= 16)
  return {
    id: 'cron_secret',
    label: 'Secret des tâches planifiées',
    status: ok ? 'ok' : 'error',
    value: ok ? 'Configuré' : secret ? 'Trop court' : 'Manquant',
    hint: ok
      ? 'Les appels /api/cron/* sont authentifiés.'
      : 'CRON_SECRET absent ou de moins de 16 caractères : toutes les tâches planifiées sont refusées.',
  }
}

async function checkWebhooks(): Promise<HealthCheck> {
  try {
    const [row] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' AND status = 'failed')::int AS failed,
        MAX(created_at) AS last_received
      FROM webhook_events
    `
    const total = Number(row.total) || 0
    const failed = Number(row.failed) || 0
    const rate = total > 0 ? failed / total : 0
    const last = row.last_received ? new Date(row.last_received).toISOString() : null
    const status: HealthStatus = rate > 0.2 ? 'error' : rate > 0.05 ? 'warning' : 'ok'
    return {
      id: 'webhooks',
      label: 'Webhooks (24 h)',
      status,
      value: total === 0 ? 'Aucun reçu' : `${Math.round(rate * 100)} % d’échecs (${fmt(failed)}/${fmt(total)})`,
      hint: last
        ? `Dernier reçu : ${new Date(last).toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan' })} (UTC).`
        : 'Aucun webhook reçu pour le moment.',
    }
  } catch (e) {
    return { id: 'webhooks', label: 'Webhooks (24 h)', status: 'error', value: 'Indisponible', hint: errorText(e) }
  }
}

async function checkPendingPayments(): Promise<HealthCheck> {
  try {
    const [row] = await sql`
      SELECT COUNT(*)::int AS n, MIN(created_at) AS oldest
      FROM subscription_checkouts
      WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 hour'
    `
    const n = Number(row.n) || 0
    return {
      id: 'payments',
      label: 'Paiements en attente',
      status: n > 0 ? 'warning' : 'ok',
      value: n > 0 ? `${fmt(n)} depuis plus d’1 h` : 'Aucun en retard',
      hint:
        n > 0
          ? 'Paiements d’abonnement non confirmés : vérifiez le rapprochement automatique et les webhooks GeniusPay.'
          : 'Tous les paiements récents ont été confirmés ou clôturés.',
    }
  } catch (e) {
    return { id: 'payments', label: 'Paiements en attente', status: 'error', value: 'Indisponible', hint: errorText(e) }
  }
}

function checkEnvironment(): HealthCheck {
  const nodeEnv = process.env.NODE_ENV || 'development'
  const isProd = nodeEnv === 'production'
  const appUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || ''
  const authDebug = process.env.AUTH_DEBUG === 'true'
  const problems: string[] = []
  if (authDebug && isProd) problems.push('AUTH_DEBUG est activé en production (journaux sensibles)')
  if (!appUrl && isProd) problems.push('URL de l’application non définie (NEXTAUTH_URL)')
  return {
    id: 'environment',
    label: 'Environnement',
    status: problems.length ? 'warning' : 'ok',
    value: nodeEnv,
    hint: [
      `URL : ${appUrl || 'non définie'}`,
      `AUTH_DEBUG : ${authDebug ? 'activé' : 'désactivé'}`,
      ...problems,
    ].join(' · '),
  }
}

async function loadJobs(): Promise<HealthJob[]> {
  const names = JOBS.map((j) => j.job)
  let rows: Record<string, unknown>[] = []
  let failure: string | null = null
  try {
    rows = (await sql`
      SELECT j.job,
        last.status AS last_status, last.started_at AS last_started, last.error AS last_error,
        ok.finished_at AS last_success
      FROM unnest(${names}::text[]) AS j(job)
      LEFT JOIN LATERAL (
        SELECT status, started_at, error FROM cron_runs r
        WHERE r.job = j.job ORDER BY started_at DESC LIMIT 1
      ) last ON true
      LEFT JOIN LATERAL (
        SELECT finished_at FROM cron_runs r
        WHERE r.job = j.job AND r.status = 'success' ORDER BY started_at DESC LIMIT 1
      ) ok ON true
    `) as Record<string, unknown>[]
  } catch (e) {
    failure = errorText(e)
  }

  const now = Date.now()
  return JOBS.map(({ job, label }) => {
    if (failure) {
      return {
        job, label, status: 'error' as const, lastRunAt: null, lastRunStatus: null, lastSuccessAt: null,
        ageMinutes: null, error: failure, hint: 'Historique des exécutions indisponible.',
      }
    }
    const r = rows.find((x) => x.job === job)
    const lastRunAt = r?.last_started ? new Date(r.last_started as string).toISOString() : null
    const lastSuccessAt = r?.last_success ? new Date(r.last_success as string).toISOString() : null
    const lastRunStatus = (r?.last_status as string) ?? null
    const ageMinutes = lastRunAt ? Math.max(0, Math.round((now - new Date(lastRunAt).getTime()) / 60000)) : null
    const successAgeH = lastSuccessAt ? (now - new Date(lastSuccessAt).getTime()) / 3_600_000 : null

    let status: HealthStatus = 'ok'
    let hint = 'Fonctionne normalement.'
    if (lastRunStatus === 'failed') {
      status = 'error'
      hint = 'La dernière exécution a échoué.'
    } else if (successAgeH == null) {
      status = 'warning'
      hint = lastRunAt ? 'Aucune exécution réussie enregistrée.' : 'Jamais exécutée : vérifiez la planification.'
    } else if (successAgeH > JOB_STALE_HOURS) {
      status = 'warning'
      hint = `Aucune exécution réussie depuis plus de ${JOB_STALE_HOURS} h.`
    } else if (lastRunStatus === 'running') {
      hint = 'Exécution en cours.'
    }
    return {
      job, label, status, lastRunAt, lastRunStatus, lastSuccessAt, ageMinutes,
      error: (r?.last_error as string) ?? null, hint,
    }
  })
}

/** GET /api/admin/health — état de la plateforme (base, paiements, e-mails, tâches…). */
export async function GET() {
  const authz = await requireAdmin('health.read')
  if (!authz.ok) return authz.response

  try {
    const [database, geniuspay, webhooks, payments, jobs] = await Promise.all([
      checkDatabase(),
      checkGeniusPay(),
      checkWebhooks(),
      checkPendingPayments(),
      loadJobs(),
    ])
    const checks: HealthCheck[] = [
      database,
      geniuspay,
      checkEmail(),
      checkRateLimit(),
      checkCronSecret(),
      webhooks,
      payments,
      checkEnvironment(),
    ]
    const status = worst([...checks.map((c) => c.status), ...jobs.map((j) => j.status)])
    return NextResponse.json({
      success: true,
      data: { status, checkedAt: new Date().toISOString(), checks, jobs },
    })
  } catch (e) {
    return handleRouteError(e, 'admin/health GET')
  }
}
