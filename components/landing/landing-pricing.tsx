'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AuthTrigger } from '@/components/auth/auth-trigger'
import { cn } from '@/lib/utils'
import type { Plan } from '@/lib/plans'

const FALLBACK: Plan[] = [
  {
    id: 'essentiel', name: 'Pack Essentiel', description: 'Pour un dépôt ou un maquis.', popular: false, pricingType: 'paid',
    features: ['Ventes, caisse et factures', 'Stock et emballages consignés', 'Crédits clients', 'Point de vente', 'Support par email'],
    prices: [{ interval: 'monthly', months: 1, price: 25000, label: '' }, { interval: 'yearly', months: 12, price: 250000, label: '' }],
  },
  {
    id: 'business', name: 'Pack Business', description: 'Pour les distributeurs et grossistes.', popular: true, pricingType: 'paid',
    features: ['Tout le Pack Essentiel', 'Plusieurs dépôts et transferts', 'Tournées de livraison', 'Rapports avancés', 'Support prioritaire'],
    prices: [{ interval: 'monthly', months: 1, price: 45000, label: '' }, { interval: 'yearly', months: 12, price: 500000, label: '' }],
  },
  {
    id: 'entreprise', name: 'Pack Entreprise', description: 'Pour les réseaux de dépôts.', popular: false, pricingType: 'on_quote',
    features: ['Tout le Pack Business', 'Utilisateurs et dépôts illimités', 'Accompagnement à la mise en place', 'Formation de l’équipe'],
    prices: [],
  },
]

function fcfa(n: number) {
  return new Intl.NumberFormat('fr-FR').format(n)
}

export function LandingPricing({ plans }: { plans: Plan[] }) {
  const list = plans.length ? plans : FALLBACK
  const [yearly, setYearly] = useState(false)
  const hasYearly = list.some((p) => p.prices.some((x) => x.interval === 'yearly'))

  return (
    <section id="pricing" className="scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-brand-strong">Tarifs</p>
          <h2 className="mt-3 text-balance text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em] text-foreground">
            Des formules claires, en FCFA
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Commencez par l’essai gratuit. Payez ensuite par Mobile Money ou carte, sans engagement.
          </p>
          {hasYearly && (
            <div className="mt-8 inline-flex rounded-xl border border-border bg-card p-1" role="radiogroup" aria-label="Périodicité">
              {[
                { v: false, label: 'Mensuel' },
                { v: true, label: 'Annuel' },
              ].map((o) => (
                <button
                  key={o.label}
                  role="radio"
                  aria-checked={yearly === o.v}
                  onClick={() => setYearly(o.v)}
                  className={cn(
                    'h-9 rounded-lg px-4 text-sm font-medium transition-colors',
                    yearly === o.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {list.map((plan) => {
            const onQuote = plan.pricingType === 'on_quote'
            const monthly = plan.prices.find((p) => p.interval === 'monthly')
            const annual = plan.prices.find((p) => p.interval === 'yearly')
            const shown = yearly && annual ? annual : (monthly ?? plan.prices[0])
            const savings = monthly && annual ? monthly.price * 12 - annual.price : 0
            return (
              <div
                key={plan.id}
                className={cn(
                  'relative flex flex-col rounded-2xl border bg-card p-7',
                  plan.popular ? 'border-brand shadow-[0_20px_50px_-24px_rgb(15_23_42/0.35)] ring-1 ring-brand' : 'border-border'
                )}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-7 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground">
                    Recommandé
                  </span>
                )}
                <h3 className="text-lg font-semibold tracking-tight text-foreground">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                <div className="mt-6 flex items-baseline gap-1.5">
                  {onQuote || !shown ? (
                    <span className="text-3xl font-semibold tracking-tight text-foreground">Sur devis</span>
                  ) : (
                    <>
                      <span className="tabular text-4xl font-semibold tracking-tight text-foreground">{fcfa(shown.price)}</span>
                      <span className="text-sm text-muted-foreground">
                        FCFA / {shown.interval === 'yearly' ? 'an' : shown.months > 1 ? `${shown.months} mois` : 'mois'}
                      </span>
                    </>
                  )}
                </div>
                {yearly && savings > 0 && !onQuote && (
                  <p className="mt-1 text-xs font-medium text-success">Économie de {fcfa(savings)} FCFA par an</p>
                )}
                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-3 text-sm text-foreground/80">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  {onQuote ? (
                    <Button variant="outline" size="lg" className="w-full" asChild>
                      <Link href="/contact">Nous contacter</Link>
                    </Button>
                  ) : (
                    <AuthTrigger
                      mode="register"
                      className={cn(
                        'inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold transition-[filter,background-color]',
                        plan.popular ? 'bg-brand text-brand-foreground hover:brightness-105' : 'bg-primary text-primary-foreground hover:bg-primary/90'
                      )}
                    >
                      Commencer l’essai gratuit
                    </AuthTrigger>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
