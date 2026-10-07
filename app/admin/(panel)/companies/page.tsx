'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageShell, PageIntro, StatusBadge } from '@/components/app/blocks'
import { Search, ChevronLeft, ChevronRight, Building2 } from 'lucide-react'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatDate, formatNumber, formatRelative } from '@/lib/format'
import { HealthBadge } from '@/components/admin/health-badge'
import type { HealthLevel } from '@/lib/admin/company-health'
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
  deletion_scheduled_at: string | null
  health: { level: HealthLevel; lastActivityAt: string | null; reasons: string[] } | null
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
    <PageShell>
      <PageIntro
        title="Entreprises"
        description={pagination ? `${formatNumber(pagination.total)} entreprise(s)` : 'Gestion des tenants'}
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Rechercher par nom ou email…"
            className="h-10 pl-9"
            aria-label="Rechercher"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par statut">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={status === f.value}
              onClick={() => {
                setStatus(f.value)
                setPage(1)
              }}
              className={`h-10 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                status === f.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {isLoading ? (
          <div className="p-5">
            <TableSkeleton columns={7} />
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
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Entreprise</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 font-medium">Santé</th>
                  <th className="px-5 py-3 font-medium">Dernière activité</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 text-right font-medium">Utilisateurs</th>
                  <th className="px-5 py-3 font-medium">Créée le</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                    <td className="px-5 py-3">
                      <Link href={`/admin/companies/${c.id}`} className="font-medium text-foreground hover:underline">
                        {c.name}
                      </Link>
                      {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                    </td>
                    <td className="px-5 py-3">
                      {c.deletion_scheduled_at ? (
                        <StatusBadge label="Suppression programmée" tone="danger" />
                      ) : (
                        <CompanyStatusBadge status={c.subscription_status} suspended={c.is_suspended} />
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <HealthBadge level={c.health?.level} title={c.health?.reasons.join(' ')} />
                    </td>
                    <td className="tabular whitespace-nowrap px-5 py-3 text-muted-foreground">
                      {c.health?.lastActivityAt ? formatRelative(c.health.lastActivityAt) : 'Jamais'}
                    </td>
                    <td className="px-5 py-3 capitalize text-foreground">
                      {c.subscription_plan_name || '—'}
                    </td>
                    <td className="tabular px-5 py-3 text-right text-foreground">{formatNumber(c.user_count)}</td>
                    <td className="tabular whitespace-nowrap px-5 py-3 text-muted-foreground">
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
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} / {pagination.pages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Page précédente"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Page suivante"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </PageShell>
  )
}

function CompanyStatusBadge({ status, suspended }: { status: string; suspended: boolean }) {
  if (suspended) return <StatusBadge label="Suspendue" tone="danger" />
  const map: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'default' }> = {
    active: { label: 'Active', tone: 'success' },
    trialing: { label: 'Essai', tone: 'warning' },
    past_due: { label: 'Impayé', tone: 'danger' },
    canceled: { label: 'Annulé', tone: 'default' },
  }
  const s = map[status] || { label: status, tone: 'default' as const }
  return <StatusBadge label={s.label} tone={s.tone} />
}
