'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Clock, Crown, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api-client'
import { formatDateShort } from '@/lib/format'

type SubInfo = {
  isActive: boolean
  status: string
  planName: string | null
  daysRemaining: number
  endsAt: string | null
}

export function SubscriptionBanner() {
  const [sub, setSub] = useState<SubInfo | null>(null)
  const { data: session } = useSession()
  // Seul le propriétaire peut choisir/payer une offre (/dashboard/plans)
  const isOwner = session?.user?.role === 'owner'

  useEffect(() => {
    let cancelled = false
    apiFetch<{ data?: { subscription?: SubInfo } }>('/api/subscription')
      .then((json) => {
        if (!cancelled && json.data?.subscription) setSub(json.data.subscription)
      })
      // Bandeau purement informatif : en cas d'échec on ne l'affiche pas
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!sub) return null

  const days = `${sub.daysRemaining} jour${sub.daysRemaining > 1 ? 's' : ''} restant${sub.daysRemaining > 1 ? 's' : ''}`

  // Active paid plan with unlimited time (e.g. Pack Entreprise) — don't show banner
  if (sub.isActive && sub.status === 'active' && sub.daysRemaining >= 999) return null

  // Essai : discret tant qu'il reste du temps, visible à l'approche de l'échéance
  if (sub.status === 'trialing' && sub.isActive) {
    const urgent = sub.daysRemaining <= 7
    return (
      <div
        className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:gap-4 ${
          urgent ? 'border-warning/40 bg-warning-soft' : 'border-border bg-card'
        }`}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${urgent ? 'bg-warning text-warning-foreground' : 'bg-brand-soft text-brand-strong'}`}>
          <Clock className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-foreground">
          <span className="font-semibold">Essai gratuit · {days}</span>
          {sub.endsAt && <span className="text-muted-foreground"> — jusqu&apos;au {formatDateShort(sub.endsAt)}</span>}
          <span className="block text-xs text-muted-foreground">
            {urgent
              ? isOwner
                ? 'Choisissez une offre pour continuer sans interruption.'
                : "L'essai se termine bientôt : prévenez le propriétaire du compte."
              : 'Toutes les fonctionnalités sont incluses pendant l’essai.'}
          </span>
        </p>
        </div>
        {isOwner && (
          <Button size="sm" variant={urgent ? 'default' : 'outline'} className="self-start sm:self-auto" asChild>
            <Link href="/dashboard/plans">
              Voir les offres <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        )}
      </div>
    )
  }

  // Active paid plan nearing expiry (≤30 days)
  if (sub.isActive && sub.status === 'active' && sub.daysRemaining <= 30 && sub.daysRemaining < 999) {
    return (
      <div className="rounded-lg border bg-warning-soft border-warning/30 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Crown className="h-4 w-4 shrink-0 text-warning-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-warning-foreground">
                {sub.planName} — {days}
              </p>
              <p className="text-[10px] text-warning-foreground mt-0.5">
                {sub.endsAt && <>Expire le {formatDateShort(sub.endsAt)}. </>}
                {isOwner
                  ? "Renouvelez pour éviter l'interruption."
                  : "Prévenez le propriétaire du compte pour éviter l'interruption."}
              </p>
            </div>
          </div>
          {isOwner && (
            <Button size="sm" className="h-7 text-[10px] font-semibold bg-warning hover:bg-warning text-white shrink-0" asChild>
              <Link href="/dashboard/plans">
                Renouveler
                <ArrowRight className="h-3 w-3 ml-1" aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
        <div className="mt-2.5 w-full bg-card/60 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full ${sub.daysRemaining <= 5 ? 'bg-destructive' : 'bg-warning'}`}
            style={{ width: `${Math.min(100, Math.max(3, (sub.daysRemaining / 30) * 100))}%` }}
          />
        </div>
      </div>
    )
  }

  // Active paid plan — show plan name quietly
  if (sub.isActive && sub.status === 'active' && sub.daysRemaining < 999) {
    return (
      <div className="flex items-center justify-between rounded-lg border bg-success-soft border-success/30 p-3 sm:p-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <Crown className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-success">
              {sub.planName} — {days}
            </p>
            {sub.endsAt && (
              <p className="text-[10px] text-success mt-0.5">
                Expire le {formatDateShort(sub.endsAt)}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}
