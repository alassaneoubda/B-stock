'use client'

import useSWR from 'swr'
import { PageShell, PageIntro, StatCard, Panel } from '@/components/app/blocks'
import {
  Building2,
  Users,
  TrendingUp,
  Clock,
  Ban,
  Sparkles,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatMoney, formatNumber } from '@/lib/format'
import { ErrorState } from '@/components/states'

const fetcher = (url: string) => apiFetch(url)

type Stats = {
  companies: {
    total: number
    active: number
    trialing: number
    inactive: number
    suspended: number
    new_30d: number
  }
  users: { total: number; active: number; active_7d: number }
  mrr: number
  arr: number
  signups: { month: string; count: number }[]
  byPlan: { plan: string; count: number }[]
}

export default function AdminDashboardPage() {
  const { data, error, isLoading, mutate } = useSWR<{ data: Stats }>('/api/admin/stats', fetcher)
  const s = data?.data

  return (
    <PageShell>
      <PageIntro title="Tableau de bord" description="Vue d’ensemble de la plateforme" />

      {isLoading ? (
        <div className="space-y-6" aria-busy="true" aria-label="Chargement">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[118px] rounded-xl" />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      ) : error || !s ? (
        <ErrorState
          description={error ? errorMessage(error) : 'Les statistiques sont indisponibles.'}
          onRetry={() => mutate()}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={TrendingUp}
              label="Revenu mensuel (MRR)"
              value={formatMoney(s.mrr)}
              hint={`ARR ${formatMoney(s.arr)}`}
              emphasis
            />
            <StatCard
              icon={Building2}
              label="Entreprises"
              value={formatNumber(s.companies.total)}
              hint={`+${formatNumber(s.companies.new_30d)} sur 30 jours`}
            />
            <StatCard
              icon={Sparkles}
              label="Abonnés actifs"
              value={formatNumber(s.companies.active)}
              hint={`${formatNumber(s.companies.trialing)} en essai`}
              tone="success"
            />
            <StatCard
              icon={Users}
              label="Utilisateurs"
              value={formatNumber(s.users.total)}
              hint={`${formatNumber(s.users.active_7d)} actifs sur 7 jours`}
              tone="info"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <MiniStat icon={Clock} label="En période d’essai" value={s.companies.trialing} tone="warning" />
            <MiniStat icon={Ban} label="Suspendues" value={s.companies.suspended} tone="danger" />
            <MiniStat icon={Building2} label="Inactives / impayées" value={s.companies.inactive} tone="muted" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Inscriptions" description="6 derniers mois" bodyClassName="p-5">
              <SignupBars data={s.signups} />
            </Panel>

            <Panel title="Répartition par plan" description="Entreprises par offre">
              {s.byPlan.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">Aucune donnée</p>
              ) : (
                <ul className="divide-y divide-border">
                  {s.byPlan.map((p) => (
                    <li key={p.plan} className="flex items-center justify-between px-5 py-3 text-sm">
                      <span className="capitalize text-foreground">{p.plan}</span>
                      <span className="tabular font-semibold text-foreground">{formatNumber(p.count)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </PageShell>
  )
}

function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: number
  tone: 'warning' | 'danger' | 'muted'
}) {
  const tones: Record<string, string> = {
    warning: 'text-warning-foreground bg-warning-soft',
    danger: 'text-destructive bg-destructive/10',
    muted: 'text-muted-foreground bg-muted',
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="tabular text-xl font-semibold leading-tight tracking-tight text-foreground">{formatNumber(value)}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function SignupBars({ data }: { data: { month: string; count: number }[] }) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">Aucune donnée</p>
  const max = Math.max(...data.map((d) => d.count), 1)
  return (
    <div className="flex h-44 items-end gap-3">
      {data.map((d, i) => {
        const isCurrent = i === data.length - 1
        return (
          <div key={d.month} className="flex flex-1 flex-col items-center gap-2">
            <span className="tabular text-[11px] font-medium text-muted-foreground">{formatNumber(d.count)}</span>
            <div className="flex w-full items-end justify-center" style={{ height: '120px' }}>
              <div
                className={`w-full max-w-[40px] rounded-t-md ${isCurrent ? 'bg-brand' : 'bg-primary/80'}`}
                style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? '4px' : '0' }}
                title={`${formatNumber(d.count)} inscription(s)`}
              />
            </div>
            <span className="tabular text-[11px] text-muted-foreground">{d.month.slice(5)}</span>
          </div>
        )
      })}
    </div>
  )
}
