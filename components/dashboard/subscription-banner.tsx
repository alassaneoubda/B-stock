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

  // Trialing
  if (sub.status === 'trialing' && sub.isActive) {
    const urgent = sub.daysRemaining <= 7
    return (
      <div
        className={`rounded-lg border p-3 sm:p-4 ${
          urgent
            ? 'bg-amber-50 border-amber-200'
            : 'bg-blue-50 border-blue-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Clock className={`h-4 w-4 shrink-0 ${urgent ? 'text-amber-600' : 'text-blue-600'}`} aria-hidden="true" />
            <div className="min-w-0">
              <p className={`text-xs font-semibold ${urgent ? 'text-amber-900' : 'text-blue-900'}`}>
                Version d&apos;essai — {days}
                {sub.endsAt && <span className="font-normal"> (jusqu&apos;au {formatDateShort(sub.endsAt)})</span>}
              </p>
              <p className={`text-[10px] mt-0.5 ${urgent ? 'text-amber-700' : 'text-blue-700'}`}>
                {urgent
                  ? isOwner
                    ? 'Votre essai expire bientôt. Choisissez une offre pour continuer.'
                    : "L'essai expire bientôt. Prévenez le propriétaire du compte."
                  : 'Accès complet à toutes les fonctionnalités pendant votre essai.'}
              </p>
            </div>
          </div>
          {isOwner && (
            <Button
              size="sm"
              className={`h-7 text-[10px] font-semibold shrink-0 ${
                urgent ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
              } text-white`}
              asChild
            >
              <Link href="/dashboard/plans">
                Voir les offres
                <ArrowRight className="h-3 w-3 ml-1" aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Active paid plan nearing expiry (≤30 days)
  if (sub.isActive && sub.status === 'active' && sub.daysRemaining <= 30 && sub.daysRemaining < 999) {
    return (
      <div className="rounded-lg border bg-amber-50 border-amber-200 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Crown className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-900">
                {sub.planName} — {days}
              </p>
              <p className="text-[10px] text-amber-700 mt-0.5">
                {sub.endsAt && <>Expire le {formatDateShort(sub.endsAt)}. </>}
                {isOwner
                  ? "Renouvelez pour éviter l'interruption."
                  : "Prévenez le propriétaire du compte pour éviter l'interruption."}
              </p>
            </div>
          </div>
          {isOwner && (
            <Button size="sm" className="h-7 text-[10px] font-semibold bg-amber-600 hover:bg-amber-700 text-white shrink-0" asChild>
              <Link href="/dashboard/plans">
                Renouveler
                <ArrowRight className="h-3 w-3 ml-1" aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
        <div className="mt-2.5 w-full bg-white/60 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full ${sub.daysRemaining <= 5 ? 'bg-red-500' : 'bg-amber-500'}`}
            style={{ width: `${Math.min(100, Math.max(3, (sub.daysRemaining / 30) * 100))}%` }}
          />
        </div>
      </div>
    )
  }

  // Active paid plan — show plan name quietly
  if (sub.isActive && sub.status === 'active' && sub.daysRemaining < 999) {
    return (
      <div className="flex items-center justify-between rounded-lg border bg-emerald-50/50 border-emerald-200 p-3 sm:p-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <Crown className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-emerald-900">
              {sub.planName} — {days}
            </p>
            {sub.endsAt && (
              <p className="text-[10px] text-emerald-700 mt-0.5">
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
