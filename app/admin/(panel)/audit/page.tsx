'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

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
  const { data, isLoading } = useSWR<{
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
        <h1 className="text-2xl font-bold text-zinc-950">Journal d&apos;audit</h1>
        <p className="text-sm text-zinc-500">
          {pagination ? `${pagination.total} action(s) enregistrée(s)` : 'Traçabilité des actions admin'}
        </p>
      </header>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
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
          className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
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
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-20 text-center text-sm text-zinc-400">Aucune action</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Admin</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">Cible</th>
                  <th className="px-5 py-3 font-medium">Détails</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="px-5 py-3 text-zinc-500 whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-5 py-3 text-zinc-700">{l.admin_email || '—'}</td>
                    <td className="px-5 py-3">
                      <Badge className="bg-zinc-100 text-zinc-700 hover:bg-zinc-100 font-mono text-xs">
                        {l.action}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-zinc-500">
                      {l.target_type ? (
                        <span>
                          {l.target_type}
                          {l.target_id && <span className="text-zinc-400"> · {l.target_id.slice(0, 8)}</span>}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3 text-zinc-400 text-xs max-w-xs truncate">
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
