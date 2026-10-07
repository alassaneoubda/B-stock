'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { Info, CheckCircle2, AlertTriangle, AlertOctagon, X } from 'lucide-react'
import { apiFetch, toastError } from '@/lib/api-client'

// Bandeau informatif : une erreur de chargement n'affiche simplement rien
const fetcher = (url: string) => apiFetch<{ data: Announcement[] }>(url)

type Announcement = {
  id: string
  title: string
  body: string
  level: 'info' | 'success' | 'warning' | 'critical'
  dismissible: boolean
}

// Bandeaux calmes : fond doux + icône colorée, texte encre (jamais la couleur seule : icône + titre)
const styles: Record<string, { bg: string; icon: React.ElementType; iconClass: string }> = {
  info: { bg: 'bg-info-soft text-foreground', icon: Info, iconClass: 'text-info' },
  success: { bg: 'bg-success-soft text-foreground', icon: CheckCircle2, iconClass: 'text-success' },
  warning: { bg: 'bg-warning-soft text-warning-foreground', icon: AlertTriangle, iconClass: 'text-warning-foreground' },
  critical: { bg: 'bg-destructive/10 text-foreground', icon: AlertOctagon, iconClass: 'text-destructive' },
}

export function AnnouncementBanner() {
  const { data, mutate } = useSWR<{ data: Announcement[] }>('/api/announcements', fetcher, {
    refreshInterval: 300000, // refresh every 5 min
  })
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const items = (data?.data || []).filter((a) => !hidden.has(a.id))
  if (items.length === 0) return null

  async function dismiss(a: Announcement) {
    setHidden((prev) => new Set(prev).add(a.id))
    if (a.dismissible) {
      try {
        await apiFetch(`/api/announcements/${a.id}/dismiss`, { method: 'POST' })
        mutate()
      } catch (e) {
        // Masquée localement, mais elle réapparaîtra au prochain chargement
        toastError(e, "L'annonce n'a pas pu être masquée durablement")
      }
    }
  }

  return (
    <div>
      {items.map((a) => {
        const s = styles[a.level] || styles.info
        const Icon = s.icon
        return (
          <div
            key={a.id}
            role={a.level === 'critical' || a.level === 'warning' ? 'alert' : 'status'}
            className={`${s.bg} flex items-start gap-3 border-b border-border px-4 py-2.5 text-sm lg:px-8`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.iconClass}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <span className="font-semibold">{a.title}</span>
              <span className="text-muted-foreground"> — {a.body}</span>
            </div>
            {a.dismissible && (
              <button
                type="button"
                onClick={() => dismiss(a)}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Masquer l'annonce « ${a.title} »`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
