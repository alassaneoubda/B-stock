'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, ChevronLeft, ChevronRight, Building2 } from 'lucide-react'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatDate, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'

const fetcher = (url: string) => apiFetch(url)

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
  const { data, error, isLoading, mutate } = useSWR<{
    data: Company[]
    pagination: { page: number; pages: number; total: number }
  }>(`/api/admin/companies?${qs}`, fetcher)

  const companies = data?.data || []
  const pagination = data?.pagination

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Entreprises</h1>
        <p className="text-sm text-muted-foreground">
          {pagination ? `${formatNumber(pagination.total)} entreprise(s)` : 'Gestion des tenants'}
        </p>
      </header>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
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
                  ? 'bg-primary text-white'
                  : 'bg-card text-muted-foreground hover:bg-muted border border-border'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-5">
            <TableSkeleton columns={5} />
          </div>
        ) : error ? (
          <ErrorState className="m-5" description={errorMessage(error)} onRetry={() => mutate()} />
        ) : companies.length === 0 ? (
          <EmptyState
            className="m-5"
            icon={Building2}
            title="Aucune entreprise"
            description={search || status ? 'Aucune entreprise ne correspond à ces filtres.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Entreprise</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Utilisateurs</th>
                  <th className="px-5 py-3 font-medium">Créée le</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/admin/companies/${c.id}`} className="font-medium text-foreground hover:underline">
                        {c.name}
                      </Link>
                      {c.email && <p className="text-xs text-muted-foreground/70">{c.email}</p>}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={c.subscription_status} suspended={c.is_suspended} />
                    </td>
                    <td className="px-5 py-3 capitalize text-foreground/80">
                      {c.subscription_plan_name || '—'}
                    </td>
                    <td className="px-5 py-3 text-foreground/80">{formatNumber(c.user_count)}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatDate(c.created_at)}
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
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} / {pagination.pages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Page précédente"
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted/50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Page suivante"
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted/50"
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
  if (suspended) return <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">Suspendue</Badge>
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: 'Active', cls: 'bg-success-soft text-success hover:bg-success-soft' },
    trialing: { label: 'Essai', cls: 'bg-warning-soft text-warning-foreground hover:bg-warning-soft' },
    past_due: { label: 'Impayé', cls: 'bg-orange-100 text-orange-700 hover:bg-orange-100' },
    canceled: { label: 'Annulé', cls: 'bg-muted text-muted-foreground hover:bg-muted' },
  }
  const s = map[status] || { label: status, cls: 'bg-muted text-muted-foreground' }
  return <Badge className={s.cls}>{s.label}</Badge>
}
