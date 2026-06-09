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

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const xof = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' FCFA'
const num = (n: number) => new Intl.NumberFormat('fr-FR').format(n || 0)

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
  const { data, isLoading } = useSWR<{ data: ReportData }>(
    `/api/admin/reports?months=${months}`,
    fetcher
  )
  const r = data?.data

  function exportCsv(type: string) {
    const url = `/api/admin/reports/export?type=${type}&months=${months}`
    window.open(url, '_blank')
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
          >
            <option value={6}>6 mois</option>
            <option value={12}>12 mois</option>
            <option value={24}>24 mois</option>
          </select>
        </div>
      </header>

      {isLoading || !r ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
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
            <ExportBtn label="Entreprises" onClick={() => exportCsv('companies')} />
            <ExportBtn label="Utilisateurs" onClick={() => exportCsv('users')} />
            <ExportBtn label="Paiements" onClick={() => exportCsv('payments')} />
            <ExportBtn label="Revenus mensuels" onClick={() => exportCsv('revenue')} />
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
                  <Tooltip />
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

function ExportBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <Download className="h-3.5 w-3.5 mr-1.5" />
      {label}
    </Button>
  )
}
