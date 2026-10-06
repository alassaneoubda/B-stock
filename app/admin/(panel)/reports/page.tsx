'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
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

const PIE_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#64748b']

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
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950">Rapports</h1>
          <p className="text-sm text-zinc-500">Analyses et exports de la plateforme</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
            aria-label="Période"
          >
            <option value={6}>6 mois</option>
            <option value={12}>12 mois</option>
            <option value={24}>24 mois</option>
          </select>
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-6" aria-busy="true" aria-label="Chargement">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
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
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Kpi
              icon={TrendingUp}
              label="Revenu total"
              value={xof(r.summary.total_revenue)}
              sub={`${num(r.summary.paid_transactions)} transactions`}
            />
            <Kpi
              icon={CreditCard}
              label={`Revenu (${r.months} mois)`}
              value={xof(r.summary.period_revenue)}
            />
            <Kpi
              icon={Building2}
              label="Entreprises"
              value={num(r.summary.total_companies)}
              sub={`${num(r.summary.active_companies)} actives · ${num(r.summary.trialing_companies)} en essai`}
            />
            <Kpi icon={Users} label="Utilisateurs" value={num(r.summary.total_users)} />
          </div>

          {/* Exports */}
          <Card className="p-4 mb-6 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-zinc-700 mr-2">Exports CSV :</span>
            <ExportBtn label="Entreprises" busy={exporting === 'companies'} disabled={!!exporting} onClick={() => exportCsv('companies')} />
            <ExportBtn label="Utilisateurs" busy={exporting === 'users'} disabled={!!exporting} onClick={() => exportCsv('users')} />
            <ExportBtn label="Paiements" busy={exporting === 'payments'} disabled={!!exporting} onClick={() => exportCsv('payments')} />
            <ExportBtn
              label="Revenus mensuels"
              busy={exporting === 'revenue'}
              disabled={!!exporting}
              onClick={() => exportCsv('revenue')}
            />
          </Card>

          {/* Revenue chart */}
          <Card className="p-6 mb-6">
            <h2 className="font-semibold text-zinc-900 mb-4">Revenus mensuels</h2>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={r.revenueByMonth}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={70}
                  tickFormatter={(v) => new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v)} />
                <Tooltip formatter={(v: number) => xof(v)} />
                <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#rev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            {/* Signups chart */}
            <Card className="p-6">
              <h2 className="font-semibold text-zinc-900 mb-4">Nouvelles entreprises</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={r.signupsByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} width={30} />
                  <Tooltip formatter={(v: number) => [formatNumber(v), 'Entreprises']} />
                  <Bar dataKey="count" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Plan distribution */}
            <Card className="p-6">
              <h2 className="font-semibold text-zinc-900 mb-4">Répartition par plan</h2>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={r.planDistribution}
                    dataKey="companies"
                    nameKey="plan"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(e: { plan: string; companies: number }) => `${e.plan} (${e.companies})`}
                    labelLine={false}
                  >
                    {r.planDistribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Revenue by plan table */}
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100">
              <h2 className="font-semibold text-zinc-900">Revenus par plan</h2>
            </div>
            {r.revenueByPlan.length === 0 ? (
              <div className="py-12 text-center text-sm text-zinc-400">Aucun revenu enregistré</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 uppercase tracking-wide">
                    <th className="px-5 py-3 font-medium">Plan</th>
                    <th className="px-5 py-3 font-medium text-right">Transactions</th>
                    <th className="px-5 py-3 font-medium text-right">Revenu</th>
                  </tr>
                </thead>
                <tbody>
                  {r.revenueByPlan.map((p) => (
                    <tr key={p.plan} className="border-b border-zinc-50">
                      <td className="px-5 py-3 text-zinc-800 font-medium">{p.plan}</td>
                      <td className="px-5 py-3 text-right text-zinc-500">{num(p.transactions)}</td>
                      <td className="px-5 py-3 text-right text-zinc-900 font-medium">{xof(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-zinc-500 mb-2">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-zinc-950">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-1">{sub}</p>}
    </Card>
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
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5 mr-1.5" />
      )}
      {label}
    </Button>
  )
}
