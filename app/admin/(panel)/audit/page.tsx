'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, ChevronLeft, ChevronRight, ScrollText } from 'lucide-react'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatDateTime, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'

const fetcher = (url: string) => apiFetch(url)

type Log = {
  id: string
  admin_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export default function AdminAuditPage() {
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)

  const qs = new URLSearchParams({ search, action, page: String(page) }).toString()
  const { data, error, isLoading, mutate } = useSWR<{
    data: Log[]
    actions: string[]
    pagination: { page: number; pages: number; total: number }
  }>(`/api/admin/audit?${qs}`, fetcher)

  const logs = data?.data || []
  const actions = data?.actions || []
  const pagination = data?.pagination

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Journal d&apos;audit</h1>
        <p className="text-sm text-muted-foreground">
          {pagination ? `${formatNumber(pagination.total)} action(s) enregistrée(s)` : 'Traçabilité des actions admin'}
        </p>
      </header>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
          <Input
            placeholder="Rechercher (admin, action, cible)…"
            className="pl-9 h-10"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            setPage(1)
          }}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
          aria-label="Filtrer par action"
        >
          <option value="">Toutes les actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-5">
            <TableSkeleton columns={5} />
          </div>
        ) : error ? (
          <ErrorState className="m-5" description={errorMessage(error)} onRetry={() => mutate()} />
        ) : logs.length === 0 ? (
          <EmptyState
            className="m-5"
            icon={ScrollText}
            title="Aucune action"
            description={search || action ? 'Aucune action ne correspond à ces filtres.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Admin</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">Cible</th>
                  <th className="px-5 py-3 font-medium">Détails</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-border hover:bg-muted/50">
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDateTime(l.created_at)}
                    </td>
                    <td className="px-5 py-3 text-foreground/80">{l.admin_email || '—'}</td>
                    <td className="px-5 py-3">
                      <Badge className="bg-muted text-foreground/80 hover:bg-muted font-mono text-xs">
                        {l.action}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {l.target_type ? (
                        <span>
                          {l.target_type}
                          {l.target_id && <span className="text-muted-foreground/70"> · {l.target_id.slice(0, 8)}</span>}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td
                      className="px-5 py-3 text-muted-foreground/70 text-xs max-w-xs truncate"
                      title={l.metadata ? JSON.stringify(l.metadata) : undefined}
                    >
                      {l.metadata ? JSON.stringify(l.metadata) : '—'}
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
