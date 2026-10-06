'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatMoney, formatDateShort } from '@/lib/format'
import { EmptyState, ErrorState } from '@/components/states'
import { Skeleton } from '@/components/ui/skeleton'

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
  pricingType?: 'paid' | 'free' | 'on_quote'
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

const intervalLabels: Record<string, string> = {
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  semiannual: 'Semestriel',
  yearly: 'Annuel',
}

type PaymentState = 'idle' | 'checking' | 'pending' | 'completed' | 'failed' | 'expired' | 'timeout' | 'error'

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
  const [loadError, setLoadError] = useState<string | null>(null)
  const checkoutLock = useRef(false)
  const [loadingCheckout, setLoadingCheckout] = useState<string | null>(null)
  const [selectedIntervals, setSelectedIntervals] = useState<Record<string, string>>({})

  // Retour de GeniusPay : ?checkout=return&reference=... (ancien format : ?success=true)
  const isReturn = searchParams.get('checkout') === 'return' || searchParams.get('success') === 'true'
  const canceled = searchParams.get('checkout') === 'canceled' || searchParams.get('canceled') === 'true'
  const returnRef = searchParams.get('reference')
  const [paymentState, setPaymentState] = useState<PaymentState>(isReturn ? 'checking' : 'idle')
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null)

  // Vérifie le paiement auprès du serveur, qui interroge GeniusPay. Tant que le
  // paiement est en attente (Mobile Money à valider sur le téléphone), on
  // re-vérifie toutes les 5 s pendant 3 minutes.
  useEffect(() => {
    if (!isReturn) return
    let cancelled = false
    let attempts = 0

    async function check() {
      attempts++
      try {
        const res = await fetch('/api/subscription/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: returnRef || undefined }),
        })
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setPaymentState('error')
          setPaymentMessage(json.error || 'Vérification du paiement impossible.')
          return
        }
        if (json.status === 'completed') {
          setPaymentState('completed')
          const sub = await fetch('/api/subscription').then((r) => r.json()).catch(() => null)
          if (!cancelled && sub?.data?.subscription) setSubscription(sub.data.subscription)
          return
        }
        if (json.status === 'failed' || json.status === 'expired') {
          setPaymentState(json.status)
          return
        }
        if (json.status === 'none') {
          setPaymentState('error')
          setPaymentMessage('Aucun paiement en cours trouvé pour votre compte.')
          return
        }
        setPaymentState('pending')
        if (json.message) setPaymentMessage(json.message)
        if (attempts < 36) setTimeout(check, 5000)
        else setPaymentState('timeout')
      } catch {
        if (cancelled) return
        if (attempts < 36) setTimeout(check, 5000)
        else setPaymentState('timeout')
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [isReturn, returnRef])

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const json = await apiFetch<{ data: { plans: Plan[]; subscription: Subscription } }>('/api/subscription')
      const nextPlans = Array.isArray(json.data.plans) ? json.data.plans : []
      setPlans(nextPlans)
      setSubscription(json.data.subscription)

      // Annuel par défaut quand plusieurs durées sont proposées
      const defaults: Record<string, string> = {}
      nextPlans.forEach((p) => {
        defaults[p.id] = p.prices.some((pr) => pr.interval === 'yearly')
          ? 'yearly'
          : p.prices[0]?.interval || 'yearly'
      })
      setSelectedIntervals(defaults)
    } catch (e) {
      setLoadError(errorMessage(e))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleCheckout(planId: string) {
    const interval = selectedIntervals[planId]
    if (!interval || checkoutLock.current) return
    checkoutLock.current = true
    setLoadingCheckout(`${planId}-${interval}`)

    try {
      const json = await apiFetch<{ directActivation?: boolean; url?: string; error?: string }>(
        '/api/geniuspay/checkout',
        { method: 'POST', body: { planId, interval } }
      )

      if (json.directActivation) {
        // Offre gratuite activée directement
        window.location.reload()
        return
      }

      if (json.url) {
        // Le bouton reste désactivé pendant la redirection vers GeniusPay
        window.location.href = json.url
        return
      }
      toastError(new Error(json.error || 'Veuillez réessayer dans un instant.'), 'Paiement impossible')
    } catch (e) {
      toastError(e, 'Paiement impossible')
    }
    checkoutLock.current = false
    setLoadingCheckout(null)
  }

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Choisir un plan" />
        <main className="flex-1 p-4 lg:p-6">
          <div className="max-w-5xl mx-auto space-y-6" aria-busy="true" aria-label="Chargement des offres">
            <Skeleton className="h-28 rounded-lg" />
            <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-96 rounded-xl" />
              ))}
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Choisir un plan" />
        <main className="flex-1 p-4 lg:p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <PaymentBanner state={paymentState} message={paymentMessage} />
            <ErrorState title="Impossible de charger les offres" description={loadError} onRetry={fetchData} />
          </div>
        </main>
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
              <ArrowLeft className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Retour
            </Link>
          </Button>
        }
      />

      <main className="flex-1 p-4 lg:p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Success / Cancel banners */}
          <PaymentBanner state={paymentState} message={paymentMessage} />
          {canceled && paymentState === 'idle' && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <XCircle className="h-5 w-5 text-amber-600 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Paiement annulé</p>
                <p className="text-xs text-amber-700">Aucun montant n&apos;a été débité. Vous pouvez réessayer à tout moment.</p>
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
                        <span className={`text-sm font-semibold ${subscription.daysRemaining <= 5 ? 'text-red-700' : subscription.daysRemaining <= 10 ? 'text-amber-700' : 'text-zinc-800'}`}>
                          {subscription.daysRemaining} jour{subscription.daysRemaining > 1 ? 's' : ''} restant{subscription.daysRemaining > 1 ? 's' : ''}
                        </span>
                        {subscription.endsAt && (
                          <span className="text-xs text-zinc-500">
                            Expire le {formatDateShort(subscription.endsAt)}
                          </span>
                        )}
                      </div>
                      {subscription.status === 'trialing' && (
                        <p className="text-xs text-blue-600">
                          Votre essai gratuit est en cours. Choisissez un plan pour continuer après l\u2019expiration.
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
          {plans.length === 0 && (
            <EmptyState
              title="Aucune offre disponible pour le moment"
              description="Contactez le support pour souscrire un abonnement."
              action={{ label: 'Contacter le support', href: '/contact' }}
            />
          )}
          <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
            {plans.map((plan) => {
              const Icon = planIcons[plan.id] || Zap
              const selectedInterval = selectedIntervals[plan.id] || plan.prices[0]?.interval
              const currentPrice = plan.prices.find((p) => p.interval === selectedInterval)
              const isCurrentPlan =
                subscription?.isActive && subscription.status === 'active' && !!subscription.planName?.startsWith(plan.name)
              const isOnQuote = plan.pricingType === 'on_quote'

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
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <h3 className="text-base font-bold text-zinc-950">{plan.name}</h3>
                    </div>
                    <p className="text-xs text-zinc-500">{plan.description}</p>
                  </div>

                  {/* Interval selector */}
                  {plan.prices.length > 1 && (
                    <div className="flex flex-wrap gap-1 mb-4" role="group" aria-label={`Durée de l'offre ${plan.name}`}>
                      {plan.prices.map((pr) => (
                        <button
                          key={pr.interval}
                          type="button"
                          aria-pressed={selectedInterval === pr.interval}
                          disabled={!!loadingCheckout}
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
                            {formatMoney(currentPrice.price)}
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
                        <Check className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" aria-hidden="true" />
                        <span className="text-xs text-zinc-700">{f}</span>
                      </li>
                    ))}
                  </ul>

                  {isOnQuote && (
                    <p className="mb-4 text-2xl font-bold text-zinc-950 tracking-tight">Sur devis</p>
                  )}

                  {/* CTA button */}
                  {isOnQuote && !isCurrentPlan ? (
                    <Button variant="outline" size="sm" className="w-full h-10 text-xs font-semibold" asChild>
                      <Link href="/contact">Nous contacter</Link>
                    </Button>
                  ) : isCurrentPlan ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-10 text-xs font-semibold"
                      disabled
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
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
                      disabled={!!loadingCheckout || (!isOnQuote && plan.pricingType !== 'free' && !currentPrice)}
                    >
                      {loadingCheckout === `${plan.id}-${selectedInterval}` ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Building2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                      )}
                      {plan.pricingType === 'free' ? 'Activer gratuitement' : subscription?.status === 'active' ? 'Renouveler / changer' : 'Choisir ce plan'}
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

function PaymentBanner({ state, message }: { state: PaymentState; message: string | null }) {
  if (state === 'idle') return null
  const config: Record<Exclude<PaymentState, 'idle'>, { tone: string; title: string; text: string; spin?: boolean }> = {
    checking: { tone: 'bg-blue-50 border-blue-200 text-blue-900', title: 'Vérification du paiement…', text: 'Nous confirmons votre paiement auprès de GeniusPay.', spin: true },
    pending: { tone: 'bg-blue-50 border-blue-200 text-blue-900', title: 'Paiement en attente de confirmation', text: 'Validez le paiement sur votre téléphone si demandé. Cette page se met à jour automatiquement.', spin: true },
    completed: { tone: 'bg-emerald-50 border-emerald-200 text-emerald-900', title: 'Paiement confirmé', text: 'Votre abonnement est actif. Merci pour votre confiance !' },
    failed: { tone: 'bg-red-50 border-red-200 text-red-900', title: 'Paiement refusé', text: "Aucun montant n'a été débité. Vous pouvez réessayer ou choisir un autre moyen de paiement." },
    expired: { tone: 'bg-amber-50 border-amber-200 text-amber-900', title: 'Paiement expiré', text: "Le délai de paiement est dépassé. Relancez le paiement depuis l'offre choisie." },
    timeout: { tone: 'bg-amber-50 border-amber-200 text-amber-900', title: 'Confirmation toujours en attente', text: 'Si vous avez payé, votre abonnement sera activé automatiquement dans quelques minutes. Sinon, contactez le support.' },
    error: { tone: 'bg-red-50 border-red-200 text-red-900', title: 'Vérification impossible', text: 'Réessayez dans un instant ou contactez le support.' },
  }
  const c = config[state]
  const Icon = state === 'completed' ? CheckCircle2 : c.spin ? Loader2 : XCircle
  return (
    <div className={`flex items-start gap-3 border rounded-lg p-4 ${c.tone}`} role="status" aria-live="polite">
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${c.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold">{c.title}</p>
        <p className="text-xs opacity-80">{message || c.text}</p>
      </div>
    </div>
  )
}
