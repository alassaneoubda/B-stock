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
      className="fixed inset-0 z-[100] bg-card/95 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="max-w-md w-full text-center">
        <div className="mx-auto h-16 w-16 rounded-xl bg-destructive/10 flex items-center justify-center mb-6">
          <ShieldAlert className="h-8 w-8 text-destructive" aria-hidden="true" />
        </div>

        <h1 id="subscription-blocker-title" className="text-xl sm:text-2xl font-bold text-foreground tracking-tight mb-3">
          {title}
        </h1>

        <p id="subscription-blocker-description" className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto leading-relaxed">
          {description}
        </p>

        {isOwner ? (
          <Button
            size="lg"
            className="h-12 px-8 text-sm font-semibold bg-primary hover:bg-primary text-white rounded-xl shadow-lg shadow-blue-600/20"
            asChild
          >
            <Link href="/dashboard/plans" ref={ctaRef}>
              Voir les offres
              <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button
            size="lg"
            variant="outline"
            className="h-12 px-8 text-sm font-semibold rounded-xl"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            Se déconnecter
          </Button>
        )}

        <p className="text-[10px] text-muted-foreground mt-6">
          Vos données sont en sécurité et seront accessibles dès la réactivation.
        </p>
      </div>
    </div>
  )
}
