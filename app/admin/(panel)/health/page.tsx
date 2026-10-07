'use client'

import useSWR from 'swr'
import { Activity, CheckCircle2, AlertTriangle, AlertOctagon, Loader2, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageShell, PageIntro, Panel, StatusBadge } from '@/components/app/blocks'
import { ErrorState, EmptyState } from '@/components/states'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

type HealthStatus = 'ok' | 'warning' | 'error'
type HealthCheck = { id: string; label: string; status: HealthStatus; value: string; hint: string }
type HealthJob = {
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
type HealthData = { status: HealthStatus; checkedAt: string; checks: HealthCheck[]; jobs: HealthJob[] }

const fetcher = (url: string) => apiFetch<{ data: HealthData }>(url)

const STATUS_META: Record<HealthStatus, { label: string; tone: 'success' | 'warning' | 'danger'; dot: string }> = {
  ok: { label: 'Opérationnel', tone: 'success', dot: 'bg-success' },
  warning: { label: 'À surveiller', tone: 'warning', dot: 'bg-warning' },
  error: { label: 'En erreur', tone: 'danger', dot: 'bg-destructive' },
}

const RUN_LABELS: Record<string, { label: string; tone: 'success' | 'danger' | 'info' }> = {
  success: { label: 'Réussie', tone: 'success' },
  failed: { label: 'Échec', tone: 'danger' },
  running: { label: 'En cours', tone: 'info' },
}

export default function AdminHealthPage() {
  const { data, error, isLoading, isValidating, mutate } = useSWR('/api/admin/health', fetcher, {
    refreshInterval: 60_000, // revérification automatique toutes les 60 s
    revalidateOnFocus: false,
  })
  const health = data?.data

  return (
    <PageShell>
      <PageIntro
        title="Santé de la plateforme"
        description="Base de données, paiements, e-mails, webhooks et tâches planifiées. Actualisation automatique toutes les 60 secondes."
        actions={
          <Button variant="outline" onClick={() => mutate()} disabled={isValidating}>
            {isValidating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCw className="h-4 w-4" aria-hidden="true" />
            )}
            Revérifier
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-6" aria-busy="true" aria-label="Vérification en cours">
          <Skeleton className="h-20 rounded-xl" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : error && !health ? (
        <ErrorState description={errorMessage(error)} onRetry={() => mutate()} />
      ) : health ? (
        <>
          <OverallHeader health={health} refreshing={isValidating} />

          <section aria-labelledby="health-checks-title" className="space-y-3">
            <h3 id="health-checks-title" className="sr-only">
              Vérifications
            </h3>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {health.checks.map((c) => (
                <CheckCard key={c.id} check={c} />
              ))}
            </ul>
          </section>

          <Panel
            title="Tâches planifiées"
            description="Dernière exécution de chaque tâche (signalée sans exécution réussie depuis 26 h)."
          >
            {health.jobs.length === 0 ? (
              <EmptyState className="m-5" icon={Activity} title="Aucune tâche suivie" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-5">Tâche</TableHead>
                      <TableHead>État</TableHead>
                      <TableHead>Dernière exécution</TableHead>
                      <TableHead>Résultat</TableHead>
                      <TableHead>Dernier succès</TableHead>
                      <TableHead className="px-5">Remarque</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {health.jobs.map((j) => {
                      const run = j.lastRunStatus ? RUN_LABELS[j.lastRunStatus] : undefined
                      return (
                        <TableRow key={j.job}>
                          <TableCell className="px-5">
                            <p className="font-medium text-foreground">{j.label}</p>
                            <p className="font-mono text-xs text-muted-foreground">{j.job}</p>
                          </TableCell>
                          <TableCell>
                            <StatusBadge label={STATUS_META[j.status].label} tone={STATUS_META[j.status].tone} />
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {j.lastRunAt ? (
                              <time dateTime={j.lastRunAt} title={formatDateTime(j.lastRunAt)}>
                                {formatRelative(j.lastRunAt)}
                              </time>
                            ) : (
                              'Jamais'
                            )}
                          </TableCell>
                          <TableCell>
                            {run ? <StatusBadge label={run.label} tone={run.tone} /> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {j.lastSuccessAt ? (
                              <time dateTime={j.lastSuccessAt} title={formatDateTime(j.lastSuccessAt)}>
                                {formatRelative(j.lastSuccessAt)}
                              </time>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="max-w-xs px-5 text-xs text-muted-foreground">
                            <p>{j.hint}</p>
                            {j.lastRunStatus === 'failed' && j.error && (
                              <p className="mt-1 line-clamp-2 font-mono text-destructive">{j.error}</p>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </PageShell>
  )
}

function OverallHeader({ health, refreshing }: { health: HealthData; refreshing: boolean }) {
  const ok = health.status === 'ok'
  const Icon = ok ? CheckCircle2 : health.status === 'warning' ? AlertTriangle : AlertOctagon
  const issues = [...health.checks, ...health.jobs].filter((c) => c.status !== 'ok').length
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5',
        ok
          ? 'border-success/30 bg-success-soft'
          : health.status === 'warning'
            ? 'border-warning/40 bg-warning-soft'
            : 'border-destructive/30 bg-destructive/5'
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card',
            ok ? 'text-success' : health.status === 'warning' ? 'text-warning-foreground' : 'text-destructive'
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-base font-semibold text-foreground">
            {ok ? 'Tous les systèmes fonctionnent' : 'Attention requise'}
          </p>
          <p className="text-sm text-muted-foreground">
            {ok ? 'Aucune anomalie détectée.' : `${issues} point${issues > 1 ? 's' : ''} à vérifier ci-dessous.`}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {refreshing ? 'Vérification…' : <>Vérifié {formatRelative(health.checkedAt)} · {formatDateTime(health.checkedAt)}</>}
      </p>
    </div>
  )
}

function CheckCard({ check }: { check: HealthCheck }) {
  const meta = STATUS_META[check.status]
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', meta.dot)} aria-hidden="true" />
          {check.label}
        </span>
        <span className="sr-only">État : {meta.label}</span>
        {check.status !== 'ok' && <StatusBadge label={meta.label} tone={meta.tone} />}
      </div>
      <p className="tabular text-lg font-semibold tracking-tight text-foreground">{check.value}</p>
      <p className="text-xs text-muted-foreground">{check.hint}</p>
    </li>
  )
}
