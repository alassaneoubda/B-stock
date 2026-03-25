import { Check } from 'lucide-react'
import Link from 'next/link'

const plans = [
  {
    name: 'Pack Essentiel',
    price: '25 000',
    description: 'Pour les petits commerces et dépôts.',
    features: ['Gestion des ventes', 'Gestion du stock', 'Gestion des clients', 'Factures automatiques', 'Support email'],
  },
  {
    name: 'Pack Business',
    price: '45 000',
    description: 'Pour les distributeurs et grossistes.',
    features: ['Tout du Pack Essentiel', 'Multi-dépôts', 'Rapports avancés', 'Gestion des tournées', 'Support prioritaire', 'Accès API'],
    popular: true,
  },
  {
    name: 'Pack Entreprise',
    price: 'Sur devis',
    description: 'Pour les grandes entreprises — accès complet.',
    features: ['Tout du Pack Business', 'Utilisateurs illimités', 'Dépôts illimités', 'Branding personnalisé', 'Formation dédiée', 'Support dédié 24/7'],
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="py-20 lg:py-32 bg-zinc-950">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-semibold text-blue-400 mb-3">Tarifs</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
            Tarification simple, sans surprise
          </h2>
          <p className="text-lg text-zinc-400 leading-relaxed">
            Des forfaits adaptés à votre volume. Tous incluent les mises à jour gratuites.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-xl p-7 flex flex-col ${plan.popular
                ? 'bg-white text-zinc-950 ring-2 ring-blue-500'
                : 'bg-zinc-900 text-white border border-zinc-800'
              }`}
            >
              {plan.popular && (
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full w-fit mb-4">
                  Recommandé
                </span>
              )}
              <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
              <p className={`text-sm mb-6 ${plan.popular ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {plan.description}
              </p>

              <div className="mb-6">
                <span className="text-4xl font-bold">{plan.price}</span>
                {plan.price !== 'Sur devis' && (
                  <span className={`text-sm font-medium ml-1 ${plan.popular ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    FCFA/mois
                  </span>
                )}
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <Check className={`h-4 w-4 shrink-0 ${plan.popular ? 'text-blue-600' : 'text-zinc-500'}`} />
                    <span className={plan.popular ? 'text-zinc-700' : 'text-zinc-300'}>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/register"
                className={`block w-full py-3 text-sm font-semibold text-center rounded-lg transition-colors ${plan.popular
                  ? 'bg-zinc-950 text-white hover:bg-zinc-800'
                  : 'bg-zinc-800 text-white hover:bg-zinc-700'
                }`}
              >
                Commencer
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
