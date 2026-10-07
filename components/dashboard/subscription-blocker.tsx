'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { signOut } from 'next-auth/react'
import { ShieldAlert, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

type SubscriptionBlockerProps = {
  status: 'expired' | 'past_due' | 'canceled'
  planName: string | null
  /** Seul le propriétaire peut choisir et payer une offre. */
  isOwner: boolean
}

export function SubscriptionBlocker({ status, planName, isOwner }: SubscriptionBlockerProps) {
  const isTrial = planName === 'Free Trial'
  const ctaRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    // Le focus va sur l'action principale (le contenu derrière est inerte)
    ctaRef.current?.focus()
  }, [])

  const titles: Record<SubscriptionBlockerProps['status'], string> = {
    expired: isTrial ? 'Votre essai gratuit est terminé' : 'Votre abonnement est arrivé à échéance',
    past_due: 'Paiement en attente',
    canceled: 'Abonnement annulé',
  }

  const ownerDescriptions: Record<SubscriptionBlockerProps['status'], string> = {
    expired: isTrial
      ? 'Votre période d’essai est arrivée à terme. Choisissez une offre pour continuer à utiliser B-Stock.'
      : `Votre abonnement${planName ? ` « ${planName} »` : ''} est arrivé à terme. Renouvelez-le pour retrouver l’accès à votre tableau de bord.`,
    past_due: 'Votre dernier paiement n’a pas abouti. Relancez le paiement depuis la page des offres pour continuer.',
    canceled: 'Votre abonnement a été annulé. Choisissez une offre pour réactiver votre accès.',
  }

  const title = titles[status] ?? titles.expired
  const description = isOwner
    ? ownerDescriptions[status] ?? ownerDescriptions.expired
    : "L'accès au compte de votre entreprise est suspendu. Contactez le propriétaire du compte pour qu'il renouvelle l'abonnement."

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="subscription-blocker-title"
      aria-describedby="subscription-blocker-description"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-lg">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
          <ShieldAlert className="h-6 w-6 text-destructive" aria-hidden="true" />
        </div>

        <h1 id="subscription-blocker-title" className="mb-2 text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>

        <p id="subscription-blocker-description" className="mx-auto mb-7 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>

        {isOwner ? (
          <Button
            variant="brand"
            className="h-11 w-full"
            asChild
          >
            <Link href="/dashboard/plans" ref={ctaRef}>
              Voir les offres
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            Se déconnecter
          </Button>
        )}

        <p className="mt-5 text-xs text-muted-foreground">
          Vos données sont en sécurité et seront accessibles dès la réactivation.
        </p>
      </div>
    </div>
  )
}
