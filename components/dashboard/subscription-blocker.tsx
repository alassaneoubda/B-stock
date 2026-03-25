'use client'

import Link from 'next/link'
import { ShieldAlert, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

type SubscriptionBlockerProps = {
  status: 'expired' | 'past_due' | 'canceled'
  planName: string | null
}

export function SubscriptionBlocker({ status, planName }: SubscriptionBlockerProps) {
  const messages: Record<string, { title: string; description: string; cta: string }> = {
    expired: {
      title: planName === 'Free Trial'
        ? 'Votre essai gratuit est terminé'
        : 'Merci de reconduire votre abonnement',
      description: planName === 'Free Trial'
        ? 'Votre période d\'essai de 30 jours est arrivée à terme. Veuillez choisir un plan pour continuer à utiliser B-Stock.'
        : `Votre abonnement ${planName || ''} est arrivé à terme. Renouvelez pour retrouver l'accès à votre tableau de bord.`,
      cta: planName === 'Free Trial' ? 'Choisir un plan' : 'Renouveler mon abonnement',
    },
    past_due: {
      title: 'Paiement en attente',
      description: 'Votre dernier paiement a échoué. Veuillez mettre à jour votre moyen de paiement pour continuer.',
      cta: 'Mettre à jour le paiement',
    },
    canceled: {
      title: 'Abonnement annulé',
      description: 'Votre abonnement a été annulé. Choisissez un plan pour réactiver votre accès.',
      cta: 'Choisir un plan',
    },
  }

  const msg = messages[status] || messages.expired

  return (
    <div className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-red-100 flex items-center justify-center mb-6">
          <ShieldAlert className="h-8 w-8 text-red-600" />
        </div>

        <h1 className="text-xl sm:text-2xl font-bold text-zinc-950 tracking-tight mb-3">
          {msg.title}
        </h1>

        <p className="text-sm text-zinc-500 mb-8 max-w-sm mx-auto leading-relaxed">
          {msg.description}
        </p>

        <Button
          size="lg"
          className="h-12 px-8 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-600/20"
          asChild
        >
          <Link href="/dashboard/plans">
            {msg.cta}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
        </Button>

        <p className="text-[10px] text-zinc-400 mt-6">
          Vos données sont en sécurité et seront accessibles dès la réactivation.
        </p>
      </div>
    </div>
  )
}
