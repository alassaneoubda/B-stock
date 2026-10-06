'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { apiFetch } from '@/lib/api-client'
import { SubscriptionBlocker } from './subscription-blocker'

type SubInfo = {
  isActive: boolean
  status: string
  planName: string | null
  daysRemaining: number
}

/**
 * Bloque le dashboard quand l'essai ou l'abonnement a expiré (les API
 * répondent alors 402). Exceptions : /dashboard/plans (pour payer), les
 * pages accessibles sans abonnement côté API (profil, sécurité, notifications)
 * et les sessions d'assistance (impersonation), que l'API laisse passer.
 */
const ALWAYS_ALLOWED = ['/dashboard/plans', '/dashboard/profile', '/dashboard/settings/security', '/dashboard/settings/notifications']

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [sub, setSub] = useState<SubInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      apiFetch<{ data?: { subscription?: SubInfo } }>('/api/subscription')
        .then((json) => {
          if (!cancelled && json.data?.subscription) setSub(json.data.subscription)
        })
        // Échec de lecture : on ne bloque pas (le serveur refuse de toute façon les API en 402)
        .catch(() => {})
    load()
    // Re-vérifie au retour sur l'onglet (essai qui expire en cours de journée, paiement fait ailleurs)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const isAllowedPage = ALWAYS_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + '/'))
  const isImpersonating = !!session?.user?.impersonatedBy

  if (sub && !sub.isActive && !isAllowedPage && !isImpersonating) {
    const blockerStatus =
      sub.status === 'past_due' ? 'past_due' :
      sub.status === 'canceled' ? 'canceled' : 'expired'

    return (
      <>
        {/* Contenu inerte derrière le blocage : ni clic ni tabulation possibles */}
        <div inert className="contents">
          {children}
        </div>
        <SubscriptionBlocker
          status={blockerStatus}
          planName={sub.planName}
          isOwner={session?.user?.role === 'owner'}
        />
      </>
    )
  }

  return <>{children}</>
}
