'use client'

import { Check } from 'lucide-react'
import { AuthTrigger } from '@/components/auth/auth-trigger'
import type { Plan } from '@/lib/plans'

function formatPrice(price: number): string {
  if (price === 0) return 'Sur devis'
  return new Intl.NumberFormat('fr-FR').format(price)
}

export function LandingPricing({ plans }: { plans: Plan[] }) {
  const displayPlans =
    plans.length > 0
      ? plans
      : [
          {
            id: 'essentiel',
            name: 'Pack Essentiel',
            description: 'Pour les petits commerces et dépôts.',
            popular: false,
            features: [
              'Gestion des ventes',
              'Gestion du stock',
              'Gestion des clients',
              'Factures automatiques',
              'Support email',
            ],
            prices: [{ interval: 'monthly' as const, months: 1, price: 25000, label: '' }],
          },
          {
            id: 'business',
            name: 'Pack Business',
            description: 'Pour les distributeurs et grossistes.',
            popular: true,
            features: [
              'Tout du Pack Essentiel',
              'Multi-dépôts',
              'Rapports avancés',
              'Gestion des tournées',
              'Support prioritaire',
            ],
            prices: [{ interval: 'monthly' as const, months: 1, price: 45000, label: '' }],
          },
          {
            id: 'entreprise',
            name: 'Pack Entreprise',
            description: 'Pour les grandes entreprises.',
            popular: false,
            features: [
              'Tout du Pack Business',
              'Utilisateurs illimités',
              'Dépôts illimités',
              'Formation dédiée',
              'Support dédié',
            ],
            prices: [{ interval: 'yearly' as const, months: 12, price: 0, label: '' }],
          },
        ]

  return (
    <section id="pricing" className="bg-[#F7F4EF] py-20 lg:py-28">
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2563EB]">
            Tarifs
          </p>
          <h2 className="mt-3 text-[clamp(1.8rem,3.5vw,2.75rem)] font-bold tracking-tight text-[#0F172A]">
            Choisissez votre formule
          </h2>
          <p className="mt-4 text-base text-[#52525B]">
            Des forfaits clairs en FCFA. L’essai gratuit pour démarrer sans risque.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {displayPlans.map((plan) => {
            const monthly =
              plan.prices.find((p) => p.interval === 'monthly') || plan.prices[0]
            const price = monthly ? Number(monthly.price) : 0
            const isCustom = price === 0

            return (
              <div
                key={plan.id}
                className={`flex flex-col rounded-[1.75rem] p-7 ${
                  plan.popular
                    ? 'bg-[#0F172A] text-white shadow-xl shadow-slate-300/40'
                    : 'border border-[#E7E2D9] bg-white text-[#0F172A]'
                }`}
              >
                {plan.popular && (
                  <span className="mb-4 w-fit rounded-full bg-[#2563EB] px-3 py-1 text-[11px] font-semibold text-white">
                    Recommandé
                  </span>
                )}
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <p
                  className={`mt-1 text-sm ${plan.popular ? 'text-slate-400' : 'text-[#64748B]'}`}
                >
                  {plan.description}
                </p>
                <div className="mt-6">
                  <span className="text-4xl font-bold tracking-tight">
                    {formatPrice(price)}
                  </span>
                  {!isCustom && (
                    <span
                      className={`ml-1 text-sm ${plan.popular ? 'text-slate-400' : 'text-[#94A3B8]'}`}
                    >
                      FCFA/mois
                    </span>
                  )}
                </div>
                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          plan.popular ? 'text-[#60A5FA]' : 'text-[#2563EB]'
                        }`}
                      />
                      <span className={plan.popular ? 'text-slate-300' : 'text-[#475569]'}>
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
                <AuthTrigger
                  mode="register"
                  className={`mt-8 block w-full rounded-full py-3 text-center text-sm font-semibold transition-colors ${
                    plan.popular
                      ? 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]'
                      : 'bg-[#0F172A] text-white hover:bg-slate-800'
                  }`}
                >
                  {isCustom ? 'Nous contacter' : 'Commencer gratuitement'}
                </AuthTrigger>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
