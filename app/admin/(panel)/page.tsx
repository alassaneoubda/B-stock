'use client'

import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import {
  Building2,
  Users,
  TrendingUp,
  Clock,
  Ban,
  Sparkles,
  Loader2,
} from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const xof = (n: number) =>
  new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'

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
  const { data, isLoading } = useSWR<{ data: Stats }>('/api/admin/stats', fetcher)
  const s = data?.data

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-950">Tableau de bord</h1>
        <p className="text-sm text-zinc-500">Vue d&apos;ensemble de la plateforme</p>
      </header>

      {isLoading || !s ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Stat icon={Building2} label="Entreprises" value={s.companies.total} hint={`+${s.companies.new_30d} ce mois`} />
            <Stat icon={TrendingUp} label="MRR" value={xof(s.mrr)} hint={`ARR ${xof(s.arr)}`} isText />
            <Stat icon={Users} label="Utilisateurs" value={s.users.total} hint={`${s.users.active_7d} actifs / 7j`} />
            <Stat icon={Sparkles} label="Abonnés actifs" value={s.companies.active} hint={`${s.companies.trialing} en essai`} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <MiniStat icon={Clock} label="En période d'essai" value={s.companies.trialing} tone="amber" />
            <MiniStat icon={Ban} label="Suspendues" value={s.companies.suspended} tone="red" />
            <MiniStat icon={Building2} label="Inactives / impayées" value={s.companies.inactive} tone="zinc" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <h2 className="text-sm font-semibold text-zinc-950 mb-4">Inscriptions (6 mois)</h2>
              <SignupBars data={s.signups} />
            </Card>

            <Card className="p-6">
              <h2 className="text-sm font-semibold text-zinc-950 mb-4">Répartition par plan</h2>
              <div className="space-y-2">
                {s.byPlan.map((p) => (
                  <div key={p.plan} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-zinc-700">{p.plan}</span>
                    <span className="font-semibold text-zinc-950">{p.count}</span>
                  </div>
                ))}
                {s.byPlan.length === 0 && (
                  <p className="text-sm text-zinc-400">Aucune donnée</p>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  isText,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  hint?: string
  isText?: boolean
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-zinc-500 mb-3">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={isText ? 'text-xl font-bold text-zinc-950' : 'text-3xl font-bold text-zinc-950'}>
        {value}
      </p>
      {hint && <p className="text-xs text-zinc-400 mt-1">{hint}</p>}
    </Card>
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
  tone: 'amber' | 'red' | 'zinc'
}) {
  const tones: Record<string, string> = {
    amber: 'text-amber-600 bg-amber-50',
    red: 'text-red-600 bg-red-50',
    zinc: 'text-zinc-600 bg-zinc-100',
  }
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xl font-bold text-zinc-950 leading-tight">{value}</p>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
    </Card>
  )
}

function SignupBars({ data }: { data: { month: string; count: number }[] }) {
  if (data.length === 0) return <p className="text-sm text-zinc-400">Aucune donnée</p>
  const max = Math.max(...data.map((d) => d.count), 1)
  return (
    <div className="flex items-end gap-3 h-40">
      {data.map((d) => (
        <div key={d.month} className="flex-1 flex flex-col items-center gap-2">
          <div className="w-full flex items-end justify-center" style={{ height: '120px' }}>
            <div
              className="w-full max-w-[40px] bg-zinc-950 rounded-t-md transition-all"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? '4px' : '0' }}
              title={`${d.count}`}
            />
          </div>
          <span className="text-[10px] text-zinc-500">{d.month.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}
