'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Check,
  Crown,
  Loader2,
  Sparkles,
  Zap,
  Building2,
  ArrowLeft,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'

type PlanPrice = {
  interval: string
  months: number
  price: number
  label: string
}

type Plan = {
  id: string
  name: string
  description: string
  popular: boolean
  features: string[]
  prices: PlanPrice[]
}

type Subscription = {
  isActive: boolean
  status: string
  planName: string | null
  daysRemaining: number
  endsAt: string | null
  trialEndsAt: string | null
}

function formatXOF(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(amount)
}

const intervalLabels: Record<string, string> = {
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  semiannual: 'Semestriel',
  yearly: 'Annuel',
}

const planIcons: Record<string, any> = {
  essentiel: Zap,
  business: Sparkles,
  entreprise: Crown,
}

export default function PlansPage() {
  const searchParams = useSearchParams()
  const [plans, setPlans] = useState<Plan[]>([])
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadingCheckout, setLoadingCheckout] = useState<string | null>(null)
  const [selectedIntervals, setSelectedIntervals] = useState<Record<string, string>>({})

  const success = searchParams.get('success')
  const canceled = searchParams.get('canceled')
  const successPlan = searchParams.get('plan')
  const successInterval = searchParams.get('interval')
  const successMonths = searchParams.get('months')
  const successRef = searchParams.get('reference')
  const [activated, setActivated] = useState(false)

  // After successful payment redirect, activate subscription (fallback for webhook)
  useEffect(() => {
    if (success && successPlan && successInterval && !activated) {
      setActivated(true)
      fetch('/api/subscription/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: successPlan,
          interval: successInterval,
          reference: successRef || undefined,
        }),
      })
        .then((r) => r.json())
        .then(() => {
          // Re-fetch subscription to update UI
          return fetch('/api/subscription')
        })
        .then((r) => r.json())
        .then((json) => {
          if (json.data?.subscription) setSubscription(json.data.subscription)
        })
        .catch((e) => console.error('Activation error:', e))
    }
  }, [success, successPlan, successInterval, successRef, activated])

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/subscription')
        if (res.ok) {
          const json = await res.json()
          setPlans(json.data.plans)
          setSubscription(json.data.subscription)

          // Default to yearly for all plans
          const defaults: Record<string, string> = {}
          json.data.plans.forEach((p: Plan) => {
            defaults[p.id] = p.prices.length > 1 ? 'yearly' : p.prices[0]?.interval || 'yearly'
          })
          setSelectedIntervals(defaults)
        }
      } catch (e) {
        console.error('Error fetching plans:', e)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [])

  async function handleCheckout(planId: string) {
    const interval = selectedIntervals[planId]
    if (!interval) return

    setLoadingCheckout(`${planId}-${interval}`)

    try {
      const res = await fetch('/api/geniuspay/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, interval }),
      })
      const json = await res.json()

      if (json.directActivation) {
        // Free plan activated directly
        window.location.reload()
        return
      }

      if (json.url) {
        window.location.href = json.url
      } else {
        console.error('No checkout URL returned')
      }
    } catch (e) {
      console.error('Checkout error:', e)
    } finally {
      setLoadingCheckout(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Abonnement" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      <DashboardHeader
        title="Choisir un plan"
        actions={
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              Retour
            </Link>
          </Button>
        }
      />

      <main className="flex-1 p-4 lg:p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Success / Cancel banners */}
          {success && (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-900">Paiement réussi !</p>
                <p className="text-xs text-emerald-700">Votre abonnement est maintenant actif.</p>
              </div>
            </div>
          )}
          {canceled && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <XCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Paiement annulé</p>
                <p className="text-xs text-amber-700">Vous pouvez réessayer à tout moment.</p>
              </div>
            </div>
          )}

          {/* Current plan status */}
          {subscription && (
            <div className={`rounded-lg border p-4 sm:p-6 ${
              subscription.status === 'trialing'
                ? 'bg-blue-50/50 border-blue-200'
                : subscription.isActive
                  ? 'bg-white border-zinc-200/80'
                  : 'bg-red-50/50 border-red-200'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1">
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Plan actuel</p>
                  <p className="text-lg font-bold text-zinc-950 mt-1">
                    {subscription.status === 'trialing'
                      ? 'Version d\u2019essai gratuite'
                      : subscription.planName && subscription.planName !== 'Abonnement actif'
                        ? subscription.planName
                        : subscription.isActive
                          ? 'Abonnement actif'
                          : 'Aucun plan actif'}
                  </p>

                  {/* Countdown */}
                  {subscription.isActive && subscription.daysRemaining < 999 && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-zinc-800">
                          {subscription.daysRemaining} jour{subscription.daysRemaining > 1 ? 's' : ''} restant{subscription.daysRemaining > 1 ? 's' : ''}
                        </span>
                        {subscription.endsAt && (
                          <span className="text-xs text-zinc-500">
                            Expire le {new Date(subscription.endsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                      {/* Progress bar */}
                      <div className="w-full bg-zinc-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            subscription.daysRemaining <= 5
                              ? 'bg-red-500'
                              : subscription.daysRemaining <= 10
                                ? 'bg-amber-500'
                                : subscription.status === 'trialing'
                                  ? 'bg-blue-500'
                                  : 'bg-emerald-500'
                          }`}
                          style={{
                            width: `${Math.min(100, Math.max(3, (subscription.daysRemaining / (subscription.status === 'trialing' ? 30 : subscription.daysRemaining + 1)) * 100))}%`,
                          }}
                        />
                      </div>
                      {subscription.status === 'trialing' && (
                        <p className="text-xs text-blue-600">
                          Votre essai gratuit de 30 jours est en cours. Choisissez un plan pour continuer après l\u2019expiration.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Expired message */}
                  {!subscription.isActive && (
                    <p className="text-xs text-red-600 mt-2">
                      Votre {subscription.status === 'expired' && subscription.planName === 'Free Trial' ? 'période d\u2019essai' : 'abonnement'} a expiré. Choisissez un plan pour continuer.
                    </p>
                  )}
                </div>

                <Badge
                  className={`self-start text-xs font-medium border-none shrink-0 ${
                    subscription.status === 'trialing'
                      ? 'bg-blue-100 text-blue-700'
                      : subscription.isActive
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-red-50 text-red-700'
                  }`}
                >
                  {subscription.status === 'trialing'
                    ? 'Essai gratuit'
                    : subscription.isActive
                      ? 'Actif'
                      : 'Expiré'}
                </Badge>
              </div>
            </div>
          )}

          {/* Plans grid */}
          <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
            {plans.map((plan) => {
              const Icon = planIcons[plan.id] || Zap
              const selectedInterval = selectedIntervals[plan.id] || plan.prices[0]?.interval
              const currentPrice = plan.prices.find((p) => p.interval === selectedInterval)
              const isCurrentPlan = subscription?.planName === plan.name && subscription?.isActive

              return (
                <div
                  key={plan.id}
                  className={`relative bg-white rounded-xl border ${
                    plan.popular
                      ? 'border-blue-300 shadow-md shadow-blue-100/50'
                      : 'border-zinc-200/80'
                  } p-5 sm:p-6 flex flex-col`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-blue-600 text-white border-none text-[10px] font-semibold px-3">
                        POPULAIRE
                      </Badge>
                    </div>
                  )}

                  {/* Plan header */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                        plan.id === 'entreprise'
                          ? 'bg-amber-100 text-amber-700'
                          : plan.popular
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-zinc-100 text-zinc-700'
                      }`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <h3 className="text-base font-bold text-zinc-950">{plan.name}</h3>
                    </div>
                    <p className="text-xs text-zinc-500">{plan.description}</p>
                  </div>

                  {/* Interval selector */}
                  {plan.prices.length > 1 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {plan.prices.map((pr) => (
                        <button
                          key={pr.interval}
                          onClick={() => setSelectedIntervals((prev) => ({ ...prev, [plan.id]: pr.interval }))}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                            selectedInterval === pr.interval
                              ? 'bg-zinc-950 text-white'
                              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                          }`}
                        >
                          {intervalLabels[pr.interval] || pr.interval}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Price */}
                  <div className="mb-4">
                    {currentPrice && (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl sm:text-3xl font-bold text-zinc-950 tracking-tight">
                            {formatXOF(currentPrice.price)}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-400 mt-0.5 uppercase tracking-wider">
                          {currentPrice.label.split('/').pop()?.trim()}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Features */}
                  <ul className="space-y-2 mb-6 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        <span className="text-xs text-zinc-700">{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA button */}
                  {isCurrentPlan ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-10 text-xs font-semibold"
                      disabled
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                      Plan actuel
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className={`w-full h-10 text-xs font-semibold ${
                        plan.popular
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : ''
                      }`}
                      onClick={() => handleCheckout(plan.id)}
                      disabled={!!loadingCheckout}
                    >
                      {loadingCheckout === `${plan.id}-${selectedInterval}` ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Building2 className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {currentPrice && currentPrice.price === 0 ? 'Activer gratuitement' : 'Choisir ce plan'}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>

          {/* FAQ / Info */}
          <div className="bg-white rounded-lg border border-zinc-200/80 p-4 sm:p-6">
            <h3 className="text-sm font-semibold text-zinc-950 mb-3">Questions fréquentes</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-zinc-700">Comment fonctionne le paiement ?</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Le paiement est sécurisé via GeniusPay (Wave, Orange Money, MTN, Moov, carte bancaire).
                  Vous payez une seule fois pour la durée choisie. À la fin de la période, vous pouvez renouveler.
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-700">Puis-je changer de plan ?</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Oui, vous pouvez passer à un plan supérieur à tout moment.
                  Le nouveau plan remplacera l&apos;ancien.
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-700">Que se passe-t-il à l&apos;expiration ?</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Vos données sont conservées. L&apos;accès au dashboard est bloqué
                  jusqu&apos;au renouvellement de votre abonnement.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
