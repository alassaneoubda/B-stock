'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { BellRing } from 'lucide-react'
import { Panel, StatusBadge } from '@/components/app/blocks'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatDate, formatRelative } from '@/lib/format'

type Reminder = {
  id: string
  kind: 'd7' | 'd3' | 'd0' | 'expired'
  period_end: string
  channel: 'email' | 'in_app'
  status: 'sent' | 'skipped' | 'failed'
  error: string | null
  created_at: string
  company_id: string
  company_name: string
}

const KIND_LABEL: Record<string, string> = { d7: 'J-7', d3: 'J-3', d0: 'Jour J', expired: 'Expiré' }
const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  sent: { label: 'Envoyée', tone: 'success' },
  skipped: { label: 'In-app', tone: 'warning' },
  failed: { label: 'Échec', tone: 'danger' },
}

export function RemindersPanel() {
  const { data, error, isLoading, mutate } = useSWR<{
    data: Reminder[]
    counts: { sent: number; skipped: number; failed: number }
  }>('/api/admin/billing/reminders', (url: string) => apiFetch(url))
  const rows = data?.data ?? []
  const counts = data?.counts

  return (
    <Panel
      title="Relances envoyées (30 j)"
      description={
        counts
          ? `${counts.sent} par email · ${counts.skipped} en annonce in-app · ${counts.failed} en échec`
          : 'Rappels automatiques J-7, J-3, jour J et lendemain de l’échéance'
      }
    >
      {isLoading ? (
        <div className="p-5">
          <TableSkeleton columns={4} rows={3} />
        </div>
      ) : error ? (
        <ErrorState className="m-5" description={errorMessage(error)} onRetry={() => mutate()} />
      ) : rows.length === 0 ? (
        <EmptyState
          className="m-5"
          icon={BellRing}
          title="Aucune relance sur 30 jours"
          description="La tâche planifiée /api/cron/subscription-reminders envoie les rappels chaque jour."
        />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const s = STATUS[r.status] ?? { label: r.status, tone: 'warning' as const }
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/admin/companies/${r.company_id}`} className="font-medium text-foreground hover:underline">
                    {r.company_name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {KIND_LABEL[r.kind] ?? r.kind} · échéance {formatDate(`${r.period_end}T12:00:00`)} · {formatRelative(r.created_at)}
                    {r.status !== 'sent' && r.error ? ` · ${r.error}` : ''}
                  </p>
                </div>
                <StatusBadge label={s.label} tone={s.tone} />
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
