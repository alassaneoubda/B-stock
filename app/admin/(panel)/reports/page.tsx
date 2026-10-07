'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { PageShell, PageIntro, StatCard, Panel } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { Loader2, Download, TrendingUp, Building2, Users, CreditCard } from 'lucide-react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError, apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatMoney, formatNumber } from '@/lib/format'
import { ErrorState } from '@/components/states'

const fetcher = (url: string) => apiFetch(url)
const xof = formatMoney
const num = formatNumber

type ReportData = {
  months: number
  revenueByMonth: { month: string; revenue: number; transactions: number }[]
  signupsByMonth: { month: string; count: number }[]
  planDistribution: { plan: string; companies: number }[]
  revenueByPlan: { plan: string; revenue: number; transactions: number }[]
  revenueByProvider: { provider: string; revenue: number; transactions: number }[]
  summary: {
    total_companies: number
    active_companies: number
    trialing_companies: number
    suspended_companies: number
    total_users: number
    total_revenue: number
    paid_transactions: number
    period_revenue: number
  }
}

const PIE_COLORS = ['var(--chart-2)', 'var(--chart-1)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--muted-foreground)']
const TOOLTIP_STYLE = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--popover-foreground)',
  fontSize: 12,
}

export default function AdminReportsPage() {
  const [months, setMonths] = useState(12)
  const [exporting, setExporting] = useState<string | null>(null)
  const { data, error, isLoading, mutate } = useSWR<{ data: ReportData }>(
    `/api/admin/reports?months=${months}`,
    fetcher
  )
  const r = data?.data

  /**
   * Téléchargement du CSV dans la page (au lieu d'un onglet qui affichait le
   * JSON d'erreur brut) : les échecs sont signalés par un toast.
   */
  async function exportCsv(type: string) {
    if (exporting) return
    setExporting(type)
    try {
      let res: Response
      try {
        res = await fetch(`/api/admin/reports/export?type=${type}&months=${months}`)
      } catch {
        throw new ApiError('Connexion impossible. Vérifiez votre réseau et réessayez.', 0, 'NETWORK')
      }
      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        throw new ApiError(payload?.error || 'L’export a échoué.', res.status)
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] || `${type}.csv`
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
      toast.success('Export téléchargé')
    } catch (e) {
      toastError(e, 'Export impossible')
    } finally {
      setExporting(null)
    }
  }

  return (
    <PageShell>
      <PageIntro
        title="Rapports"
        description="Analyses et exports de la plateforme"
        actions={
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Période"
          >
            <option value={6}>6 mois</option>
            <option value={12}>12 mois</option>
            <option value={24}>24 mois</option>
          </select>
        }
      />

      {isLoading ? (
        <div className="space-y-6" aria-busy="true" aria-label="Chargement">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[118px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : error || !r ? (
        <ErrorState
          description={error ? errorMessage(error) : 'Les rapports sont indisponibles.'}
          onRetry={() => mutate()}
        />
      ) : (
        <>
          {/* Indicateurs */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={TrendingUp}
              label="Revenu total"
              value={xof(r.summary.total_revenue)}
              hint={`${num(r.summary.paid_transactions)} transactions`}
              emphasis
            />
            <StatCard
              icon={CreditCard}
              label={`Revenu (${r.months} mois)`}
              value={xof(r.summary.period_revenue)}
              tone="brand"
            />
            <StatCard
              icon={Building2}
              label="Entreprises"
              value={num(r.summary.total_companies)}
              hint={`${num(r.summary.active_companies)} actives · ${num(r.summary.trialing_companies)} en essai`}
              tone="success"
            />
            <StatCard icon={Users} label="Utilisateurs" value={num(r.summary.total_users)} tone="info" />
          </div>

          {/* Exports */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-5 py-3.5 shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
            <span className="mr-2 text-sm font-medium text-foreground">Exports CSV</span>
            <ExportBtn label="Entreprises" busy={exporting === 'companies'} disabled={!!exporting} onClick={() => exportCsv('companies')} />
            <ExportBtn label="Utilisateurs" busy={exporting === 'users'} disabled={!!exporting} onClick={() => exportCsv('users')} />
            <ExportBtn label="Paiements" busy={exporting === 'payments'} disabled={!!exporting} onClick={() => exportCsv('payments')} />
            <ExportBtn
              label="Revenus mensuels"
              busy={exporting === 'revenue'}
              disabled={!!exporting}
              onClick={() => exportCsv('revenue')}
            />
          </div>

          {/* Revenus mensuels */}
          <Panel title="Revenus mensuels" description={`${r.months} derniers mois`} bodyClassName="p-5">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={r.revenueByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} stroke="var(--border)" tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} stroke="var(--border)" width={70} tickLine={false} axisLine={false}
                  tickFormatter={(v) => new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v)} />
                <Tooltip formatter={(v: number) => xof(v)} contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="revenue" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.08} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Nouvelles entreprises */}
            <Panel title="Nouvelles entreprises" description="Inscriptions par mois" bodyClassName="p-5">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={r.signupsByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} stroke="var(--border)" tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} stroke="var(--border)" allowDecimals={false} width={30} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => [formatNumber(v), 'Entreprises']} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--muted)' }} />
                  <Bar dataKey="count" fill="var(--chart-2)" radius={[4, 4, 0, 0]}>
                    {r.signupsByMonth.map((_, i) => {
                      const isCurrent = i === r.signupsByMonth.length - 1
                      return <Cell key={i} fill={isCurrent ? 'var(--chart-1)' : 'var(--chart-2)'} fillOpacity={isCurrent ? 1 : 0.8} />
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            {/* Répartition par plan */}
            <Panel title="Répartition par plan" description="Entreprises par offre" bodyClassName="p-5">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={r.planDistribution}
                    dataKey="companies"
                    nameKey="plan"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    stroke="var(--card)"
                    label={(e: { plan: string; companies: number }) => `${e.plan} (${e.companies})`}
                    labelLine={false}
                  >
                    {r.planDistribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          {/* Revenus par plan */}
          <Panel title="Revenus par plan">
            {r.revenueByPlan.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Aucun revenu enregistré</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-5 py-3 font-medium">Plan</th>
                      <th className="px-5 py-3 text-right font-medium">Transactions</th>
                      <th className="px-5 py-3 text-right font-medium">Revenu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.revenueByPlan.map((p) => (
                      <tr key={p.plan} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                        <td className="px-5 py-3 font-medium text-foreground">{p.plan}</td>
                        <td className="tabular px-5 py-3 text-right text-muted-foreground">{num(p.transactions)}</td>
                        <td className="tabular whitespace-nowrap px-5 py-3 text-right font-medium text-foreground">{xof(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </PageShell>
  )
}

function ExportBtn({
  label,
  onClick,
  busy,
  disabled,
}: {
  label: string
  onClick: () => void
  busy?: boolean
  disabled?: boolean
}) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={disabled}>
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {label}
    </Button>
  )
}
