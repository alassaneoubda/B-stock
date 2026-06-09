'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, TrendingUp, Calendar, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const xof = (n: number) => new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'

type Payment = {
  id: string
  reference: string | null
  plan_name: string | null
  amount: number
  currency: string
  months: number
  status: string
  provider: string
  created_at: string
  company_id: string | null
  company_name: string | null
}

const statusFilters = [
  { value: '', label: 'Tous' },
  { value: 'completed', label: 'Complétés' },
  { value: 'failed', label: 'Échoués' },
  { value: 'refunded', label: 'Remboursés' },
  { value: 'manual', label: 'Manuels' },
]

export default function AdminBillingPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)

  const qs = new URLSearchParams({ search, status, page: String(page) }).toString()
  const { data, isLoading, mutate } = useSWR<{
    data: Payment[]
    summary: { revenueTotal: number; revenueMonth: number; completed: number; failed: number; refunded: number }
    pagination: { page: number; pages: number; total: number }
  }>(`/api/admin/billing?${qs}`, fetcher)

  const payments = data?.data || []
  const summary = data?.summary
  const pagination = data?.pagination

  async function refund(id: string) {
    if (!confirm('Marquer ce paiement comme remboursé ?')) return
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/billing/${id}/refund`, { method: 'POST' })
      if (res.ok) await mutate()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-950">Facturation</h1>
        <p className="text-sm text-zinc-500">Historique des paiements d&apos;abonnement</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Revenu total</span>
          </div>
          <p className="text-2xl font-bold text-zinc-950">{summary ? xof(summary.revenueTotal) : '—'}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <Calendar className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Ce mois-ci</span>
          </div>
          <p className="text-2xl font-bold text-zinc-950">{summary ? xof(summary.revenueMonth) : '—'}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wide">Transactions</span>
          </div>
          <p className="text-sm text-zinc-700">
            <span className="font-bold text-green-600">{summary?.completed ?? 0}</span> complétées ·{' '}
            <span className="font-bold text-red-600">{summary?.failed ?? 0}</span> échouées ·{' '}
            <span className="font-bold text-zinc-600">{summary?.refunded ?? 0}</span> remboursées
          </p>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Rechercher (entreprise, référence, plan)…"
            className="pl-9 h-10"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setStatus(f.value)
                setPage(1)
              }}
              className={`px-3 h-10 rounded-lg text-sm font-medium transition-colors ${
                status === f.value
                  ? 'bg-zinc-950 text-white'
                  : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : payments.length === 0 ? (
          <div className="py-20 text-center text-sm text-zinc-400">Aucun paiement</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Entreprise</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Montant</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="px-5 py-3 text-zinc-500 whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-5 py-3">
                      {p.company_id ? (
                        <Link href={`/admin/companies/${p.company_id}`} className="text-zinc-900 hover:underline">
                          {p.company_name || '—'}
                        </Link>
                      ) : (
                        <span className="text-zinc-400">{p.company_name || 'Supprimée'}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-zinc-700">
                      {p.plan_name || '—'}
                      <span className="text-xs text-zinc-400"> · {p.provider}</span>
                    </td>
                    <td className="px-5 py-3 font-medium text-zinc-900">{xof(Number(p.amount))}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      {p.status === 'completed' && Number(p.amount) > 0 && (
                        <Button size="sm" variant="outline" onClick={() => refund(p.id)} disabled={busy === p.id}>
                          {busy === p.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Rembourser
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-zinc-500">
            Page {pagination.page} / {pagination.pages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-zinc-200 bg-white disabled:opacity-40 hover:bg-zinc-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-zinc-200 bg-white disabled:opacity-40 hover:bg-zinc-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    completed: { label: 'Complété', cls: 'bg-green-100 text-green-700 hover:bg-green-100' },
    failed: { label: 'Échoué', cls: 'bg-red-100 text-red-700 hover:bg-red-100' },
    refunded: { label: 'Remboursé', cls: 'bg-zinc-200 text-zinc-700 hover:bg-zinc-200' },
    manual: { label: 'Manuel', cls: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
  }
  const s = map[status] || { label: status, cls: 'bg-zinc-100 text-zinc-600' }
  return <Badge className={s.cls}>{s.label}</Badge>
}
