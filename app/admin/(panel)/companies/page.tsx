'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Company = {
  id: string
  name: string
  email: string | null
  subscription_status: string
  subscription_plan_name: string | null
  is_suspended: boolean
  user_count: number
  created_at: string
}

const statusFilters = [
  { value: '', label: 'Toutes' },
  { value: 'active', label: 'Actives' },
  { value: 'trialing', label: 'Essai' },
  { value: 'suspended', label: 'Suspendues' },
]

export default function AdminCompaniesPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const qs = new URLSearchParams({ search, status, page: String(page) }).toString()
  const { data, isLoading } = useSWR<{
    data: Company[]
    pagination: { page: number; pages: number; total: number }
  }>(`/api/admin/companies?${qs}`, fetcher)

  const companies = data?.data || []
  const pagination = data?.pagination

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-950">Entreprises</h1>
        <p className="text-sm text-zinc-500">
          {pagination ? `${pagination.total} entreprise(s)` : 'Gestion des tenants'}
        </p>
      </header>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Rechercher par nom ou email…"
            className="pl-9 h-10"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="flex gap-1.5">
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
        ) : companies.length === 0 ? (
          <div className="py-20 text-center text-sm text-zinc-400">Aucune entreprise</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Entreprise</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Utilisateurs</th>
                  <th className="px-5 py-3 font-medium">Créée le</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-50 hover:bg-zinc-50 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/admin/companies/${c.id}`} className="font-medium text-zinc-950 hover:underline">
                        {c.name}
                      </Link>
                      {c.email && <p className="text-xs text-zinc-400">{c.email}</p>}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={c.subscription_status} suspended={c.is_suspended} />
                    </td>
                    <td className="px-5 py-3 capitalize text-zinc-700">
                      {c.subscription_plan_name || '—'}
                    </td>
                    <td className="px-5 py-3 text-zinc-700">{c.user_count}</td>
                    <td className="px-5 py-3 text-zinc-500">
                      {new Date(c.created_at).toLocaleDateString('fr-FR')}
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

function StatusBadge({ status, suspended }: { status: string; suspended: boolean }) {
  if (suspended) return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Suspendue</Badge>
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: 'Active', cls: 'bg-green-100 text-green-700 hover:bg-green-100' },
    trialing: { label: 'Essai', cls: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
    past_due: { label: 'Impayé', cls: 'bg-orange-100 text-orange-700 hover:bg-orange-100' },
    canceled: { label: 'Annulé', cls: 'bg-zinc-100 text-zinc-600 hover:bg-zinc-100' },
  }
  const s = map[status] || { label: status, cls: 'bg-zinc-100 text-zinc-600' }
  return <Badge className={s.cls}>{s.label}</Badge>
}
