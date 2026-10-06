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

const styles: Record<string, { bg: string; icon: React.ElementType }> = {
  info: { bg: 'bg-blue-600 text-white', icon: Info },
  success: { bg: 'bg-green-600 text-white', icon: CheckCircle2 },
  warning: { bg: 'bg-amber-500 text-amber-950', icon: AlertTriangle },
  critical: { bg: 'bg-red-600 text-white', icon: AlertOctagon },
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
            className={`${s.bg} px-4 py-2.5 flex items-start gap-3 text-sm`}
          >
            <Icon className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold">{a.title}</span>
              <span className="opacity-90"> — {a.body}</span>
            </div>
            {a.dismissible && (
              <button
                type="button"
                onClick={() => dismiss(a)}
                className="shrink-0 rounded p-0.5 hover:bg-black/10 transition-colors"
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
