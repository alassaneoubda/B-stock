'use client'

import useSWR from 'swr'
import {
  Ban,
  Building2,
  CalendarPlus,
  CheckCircle2,
  CreditCard,
  Download,
  History,
  KeyRound,
  LogIn,
  RotateCcw,
  ShoppingCart,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  UserCog,
  type LucideIcon,
} from 'lucide-react'
import { Panel } from '@/components/app/blocks'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { TimelineEvent, TimelineTone } from '@/lib/admin/timeline'

const fetcher = (url: string) => apiFetch(url)

export const timelineKey = (companyId: string) => `/api/admin/companies/${companyId}/timeline`

const TONE: Record<TimelineTone, string> = {
  default: 'bg-muted text-muted-foreground',
  brand: 'bg-brand-soft text-brand-strong',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning-foreground',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-info-soft text-info',
}

const ACTION_ICONS: Record<string, LucideIcon> = {
  'company.set_plan': CreditCard,
  'company.extend_trial': CalendarPlus,
  'company.set_status': CreditCard,
  'company.suspend': Ban,
  'company.reactivate': CheckCircle2,
  'company.schedule_deletion': Trash2,
  'company.cancel_deletion': RotateCcw,
  'company.export': Download,
  'company.features': SlidersHorizontal,
  'company.note_delete': StickyNote,
  impersonate: LogIn,
  'user.reset_password_link': KeyRound,
  'user.set_role': UserCog,
  'user.activate': UserCog,
  'user.deactivate': UserCog,
  'payment.refund': RotateCcw,
}

function iconFor(e: TimelineEvent): LucideIcon {
  if (e.kind === 'created') return Building2
  if (e.kind === 'payment') return CreditCard
  if (e.kind === 'checkout') return ShoppingCart
  if (e.kind === 'note') return StickyNote
  return (e.action && ACTION_ICONS[e.action]) || History
}

/** Panneau « Historique » : événements du compte, du plus récent au plus ancien. */
export function CompanyTimelinePanel({ companyId }: { companyId: string }) {
  const { data, error, isLoading, mutate } = useSWR<{ data: TimelineEvent[] }>(timelineKey(companyId), fetcher)
  const events = data?.data ?? []

  return (
    <Panel title="Historique" description="Création, paiements, actions de l’équipe et notes">
      {isLoading ? (
        <div className="p-5">
          <TableSkeleton rows={5} columns={2} />
        </div>
      ) : error ? (
        <ErrorState className="m-5 py-8" description={errorMessage(error)} onRetry={() => mutate()} />
      ) : events.length === 0 ? (
        <EmptyState className="m-5 py-8" icon={History} title="Aucun événement" />
      ) : (
        <ol className="max-h-[560px] overflow-y-auto px-5 py-4" aria-label="Historique du compte">
          {events.map((e, i) => {
            const Icon = iconFor(e)
            return (
              <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                {i < events.length - 1 && (
                  <span className="absolute left-[15px] top-8 bottom-0 w-px bg-border" aria-hidden="true" />
                )}
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', TONE[e.tone])}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-sm font-medium text-foreground">{e.label}</p>
                    <time dateTime={e.date} className="tabular text-xs text-muted-foreground">
                      {formatDateTime(e.date)}
                    </time>
                  </div>
                  {e.detail && <p className="mt-0.5 break-words text-sm text-muted-foreground">{e.detail}</p>}
                  {e.actor && <p className="mt-0.5 text-xs text-muted-foreground">par {e.actor}</p>}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}
