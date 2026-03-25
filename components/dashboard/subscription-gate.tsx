'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { SubscriptionBlocker } from './subscription-blocker'

type SubInfo = {
  isActive: boolean
  status: string
  planName: string | null
  daysRemaining: number
}

/**
 * Client component that checks subscription status and blocks the dashboard
 * if the subscription/trial has expired. The /dashboard/plans page is always allowed.
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sub, setSub] = useState<SubInfo | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    fetch('/api/subscription')
      .then((r) => r.json())
      .then((json) => {
        if (json.data?.subscription) {
          setSub(json.data.subscription)
        }
      })
      .catch(() => {})
      .finally(() => setChecked(true))
  }, [])

  // Always allow /dashboard/plans page (so user can pay)
  const isPlansPage = pathname === '/dashboard/plans'

  // While checking, render children (avoids flash)
  if (!checked) return <>{children}</>

  // If subscription expired and NOT on plans page, show blocker
  if (sub && !sub.isActive && !isPlansPage) {
    const blockerStatus =
      sub.status === 'past_due' ? 'past_due' :
      sub.status === 'canceled' ? 'canceled' : 'expired'

    return (
      <>
        {children}
        <SubscriptionBlocker
          status={blockerStatus as 'expired' | 'past_due' | 'canceled'}
          planName={sub.planName}
        />
      </>
    )
  }

  return <>{children}</>
}
