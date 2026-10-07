'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { PageShell, Panel, StatusBadge } from '@/components/app/blocks'
import {
  Check,
  Crown,
  Loader2,
  Sparkles,
  Zap,
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

  // Sélecteur de durée commun quand toutes les offres à plusieurs durées proposent les mêmes
  const multiPricePlans = plans.filter((p) => p.prices.length > 1)
  const sharedIntervals =
    multiPricePlans.length > 0 &&
    multiPricePlans.every(
      (p) => p.prices.map((pr) => pr.interval).join('|') === multiPricePlans[0].prices.map((pr) => pr.interval).join('|')
    )
      ? multiPricePlans[0].prices.map((pr) => pr.interval)
      : null
  const sharedSelected = sharedIntervals ? selectedIntervals[multiPricePlans[0].id] || sharedIntervals[0] : null
  const selectSharedInterval = (interval: string) =>
    setSelectedIntervals((prev) => {
      const next = { ...prev }
      plans.forEach((p) => {
        if (p.prices.some((pr) => pr.interval === interval)) next[p.id] = interval
      })
      return next
    })

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title="Offres et tarifs" />
        <PageShell className="max-w-5xl">
          <div className="space-y-6" aria-busy="true" aria-label="Chargement des offres">
            <Skeleton className="h-28 rounded-xl" />
            <div className="grid gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-96 rounded-xl" />
              ))}
            </div>
          </div>
        </PageShell>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title="Offres et tarifs" />
        <PageShell className="max-w-5xl">
          <PaymentBanner state={paymentState} message={paymentMessage} />
          <ErrorState title="Impossible de charger les offres" description={loadError} onRetry={fetchData} />
        </PageShell>
      </div>
    )
  }

  const subscriptionTone: 'brand' | 'success' | 'danger' = subscription
    ? subscription.status === 'trialing'
      ? 'brand'
      : subscription.isActive
        ? 'success'
        : 'danger'
    : 'success'

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title="Offres et tarifs"
        description="Choisissez la formule adaptée à votre activité"
        actions={
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
            <Link href="/dashboard">
              <ArrowLeft aria-hidden="true" />
              Tableau de bord
            </Link>
          </Button>
        }
      />

      <PageShell className="max-w-5xl">
        {/* Retour de paiement / annulation */}
        <PaymentBanner state={paymentState} message={paymentMessage} />
        {canceled && paymentState === 'idle' && (
          <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4" role="status">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-warning-foreground">Paiement annulé</p>
              <p className="text-[13px] text-warning-foreground/80">Aucun montant n’a été débité. Vous pouvez réessayer à tout moment.</p>
            </div>
          </div>
        )}

        {/* Offre actuelle */}
        {subscription && (
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-muted-foreground">Offre actuelle</p>
                <div className="mt-1 flex flex-wrap items-center gap-2.5">
                  <p className="text-lg font-semibold tracking-tight text-foreground">
                    {subscription.status === 'trialing'
                      ? 'Version d’essai gratuite'
                      : subscription.planName && subscription.planName !== 'Abonnement actif'
                        ? subscription.planName
                        : subscription.isActive
                          ? 'Abonnement actif'
                          : 'Aucun plan actif'}
                  </p>
                  <StatusBadge
                    tone={subscriptionTone}
                    label={subscription.status === 'trialing' ? 'Essai gratuit' : subscription.isActive ? 'Actif' : 'Expiré'}
                  />
                </div>

                {subscription.status === 'trialing' && subscription.isActive && subscription.daysRemaining < 999 && (
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    Votre essai gratuit est en cours. Choisissez un plan pour continuer après l’expiration.
                  </p>
                )}

                {/* Message d'expiration */}
                {!subscription.isActive && (
                  <p className="mt-2 text-[13px] text-destructive">
                    Votre {subscription.status === 'expired' && subscription.planName === 'Free Trial' ? 'période d’essai' : 'abonnement'} a expiré. Choisissez un plan pour continuer.
                  </p>
                )}
              </div>

              {/* Compte à rebours */}
              {subscription.isActive && subscription.daysRemaining < 999 && (
                <div className="shrink-0 sm:text-right">
                  <p
                    className={`tabular text-2xl font-semibold tracking-tight ${
                      subscription.daysRemaining <= 5
                        ? 'text-destructive'
                        : subscription.daysRemaining <= 10
                          ? 'text-warning-foreground'
                          : 'text-foreground'
                    }`}
                  >
                    {subscription.daysRemaining} jour{subscription.daysRemaining > 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    restant{subscription.daysRemaining > 1 ? 's' : ''}
                    {subscription.endsAt && <> · expire le {formatDateShort(subscription.endsAt)}</>}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Offres */}
        {plans.length === 0 && (
          <EmptyState
            title="Aucune offre disponible pour le moment"
            description="Contactez le support pour souscrire un abonnement."
            action={{ label: 'Contacter le support', href: '/contact' }}
          />
        )}

        {plans.length > 0 && (
          <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Choisir une offre</h2>
              <p className="text-sm text-muted-foreground">Paiement unique pour la durée choisie, sans engagement.</p>
            </div>
            {sharedIntervals && sharedSelected && (
              <div
                role="radiogroup"
                aria-label="Durée de l’abonnement"
                className="inline-flex rounded-lg border border-border bg-muted p-1"
              >
                {sharedIntervals.map((interval) => {
                  const active = sharedSelected === interval
                  return (
                    <button
                      key={interval}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={!!loadingCheckout}
                      onClick={() => selectSharedInterval(interval)}
                      className={`h-8 rounded-md px-3 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                        active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {intervalLabels[interval] || interval}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div className="grid items-stretch gap-4 md:grid-cols-3">
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
                className={`relative flex flex-col rounded-xl border bg-card p-6 ${
                  plan.popular
                    ? 'border-transparent shadow-md ring-2 ring-brand'
                    : 'border-border shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]'
                }`}
              >
                {/* En-tête de l'offre */}
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      plan.popular ? 'bg-brand-soft text-brand-strong' : 'bg-muted text-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  {plan.popular && (
                    <span className="inline-flex items-center rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-brand-foreground">
                      Recommandé
                    </span>
                  )}
                </div>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">{plan.name}</h3>
                <p className="mt-1 min-h-10 text-[13px] leading-relaxed text-muted-foreground">{plan.description}</p>

                {/* Sélecteur de durée propre à l'offre (si les durées diffèrent d'une offre à l'autre) */}
                {!sharedIntervals && plan.prices.length > 1 && (
                  <div
                    className="mt-4 inline-flex w-full rounded-lg border border-border bg-muted p-0.5"
                    role="radiogroup"
                    aria-label={`Durée de l'offre ${plan.name}`}
                  >
                    {plan.prices.map((pr) => {
                      const active = selectedInterval === pr.interval
                      return (
                        <button
                          key={pr.interval}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={!!loadingCheckout}
                          onClick={() => setSelectedIntervals((prev) => ({ ...prev, [plan.id]: pr.interval }))}
                          className={`h-7 flex-1 rounded-md px-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                            active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {intervalLabels[pr.interval] || pr.interval}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Prix */}
                <div className="mt-5 border-t border-border pt-5">
                  {isOnQuote ? (
                    <p className="text-3xl font-semibold tracking-tight text-foreground">Sur devis</p>
                  ) : currentPrice ? (
                    <>
                      <p className="tabular text-3xl font-semibold tracking-tight text-foreground">{formatMoney(currentPrice.price)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{currentPrice.label.split('/').pop()?.trim()}</p>
                    </>
                  ) : null}
                </div>

                {/* Fonctionnalités */}
                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                      <span className="text-[13px] text-foreground/85">{f}</span>
                    </li>
                  ))}
                </ul>

                {/* Action */}
                <div className="mt-6">
                  {isOnQuote && !isCurrentPlan ? (
                    <Button variant="outline" className="h-10 w-full" asChild>
                      <Link href="/contact">Nous contacter</Link>
                    </Button>
                  ) : isCurrentPlan ? (
                    <Button variant="outline" className="h-10 w-full" disabled>
                      <CheckCircle2 aria-hidden="true" />
                      Plan actuel
                    </Button>
                  ) : (
                    <Button
                      variant={plan.popular ? 'brand' : 'outline'}
                      className="h-10 w-full"
                      onClick={() => handleCheckout(plan.id)}
                      disabled={!!loadingCheckout || (!isOnQuote && plan.pricingType !== 'free' && !currentPrice)}
                    >
                      {loadingCheckout === `${plan.id}-${selectedInterval}` && (
                        <Loader2 className="animate-spin" aria-hidden="true" />
                      )}
                      {plan.pricingType === 'free' ? 'Activer gratuitement' : subscription?.status === 'active' ? 'Renouveler / changer' : 'Choisir ce plan'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Questions fréquentes */}
        <Panel title="Questions fréquentes">
          <dl className="divide-y divide-border">
            <div className="px-5 py-4">
              <dt className="text-sm font-medium text-foreground">Comment fonctionne le paiement ?</dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Le paiement est sécurisé via GeniusPay (Wave, Orange Money, MTN, Moov, carte bancaire).
                Vous payez une seule fois pour la durée choisie. À la fin de la période, vous pouvez renouveler.
              </dd>
            </div>
            <div className="px-5 py-4">
              <dt className="text-sm font-medium text-foreground">Puis-je changer de plan ?</dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Oui, vous pouvez passer à un plan supérieur à tout moment. Le nouveau plan remplacera l’ancien.
              </dd>
            </div>
            <div className="px-5 py-4">
              <dt className="text-sm font-medium text-foreground">Que se passe-t-il à l’expiration ?</dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Vos données sont conservées. L’accès au tableau de bord est bloqué jusqu’au renouvellement de votre abonnement.
              </dd>
            </div>
          </dl>
        </Panel>
      </PageShell>
    </div>
  )
}

function PaymentBanner({ state, message }: { state: PaymentState; message: string | null }) {
  if (state === 'idle') return null
  const config: Record<Exclude<PaymentState, 'idle'>, { tone: string; title: string; text: string; spin?: boolean }> = {
    checking: { tone: 'bg-brand-soft border-brand/30 text-brand-strong', title: 'Vérification du paiement…', text: 'Nous confirmons votre paiement auprès de GeniusPay.', spin: true },
    pending: { tone: 'bg-brand-soft border-brand/30 text-brand-strong', title: 'Paiement en attente de confirmation', text: 'Validez le paiement sur votre téléphone si demandé. Cette page se met à jour automatiquement.', spin: true },
    completed: { tone: 'bg-success-soft border-success/30 text-success', title: 'Paiement confirmé', text: 'Votre abonnement est actif. Merci pour votre confiance !' },
    failed: { tone: 'bg-destructive/5 border-destructive/20 text-destructive', title: 'Paiement refusé', text: "Aucun montant n'a été débité. Vous pouvez réessayer ou choisir un autre moyen de paiement." },
    expired: { tone: 'bg-warning-soft border-warning/40 text-warning-foreground', title: 'Paiement expiré', text: "Le délai de paiement est dépassé. Relancez le paiement depuis l'offre choisie." },
    timeout: { tone: 'bg-warning-soft border-warning/40 text-warning-foreground', title: 'Confirmation toujours en attente', text: 'Si vous avez payé, votre abonnement sera activé automatiquement dans quelques minutes. Sinon, contactez le support.' },
    error: { tone: 'bg-destructive/5 border-destructive/20 text-destructive', title: 'Vérification impossible', text: 'Réessayez dans un instant ou contactez le support.' },
  }
  const c = config[state]
  const Icon = state === 'completed' ? CheckCircle2 : c.spin ? Loader2 : XCircle
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${c.tone}`} role="status" aria-live="polite">
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${c.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold">{c.title}</p>
        <p className="text-[13px] opacity-80">{message || c.text}</p>
      </div>
    </div>
  )
}
