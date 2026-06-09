import { Shield, History, BarChart3 } from 'lucide-react'
import { HeroCta } from '@/components/landing/hero-cta'

const highlights = [
  {
    icon: Shield,
    title: 'Données sécurisées',
    description: 'Cryptage de bout en bout pour vos informations sensibles.',
  },
  {
    icon: History,
    title: 'Essai gratuit 30 jours',
    description: 'Découvrez toutes les fonctionnalités sans engagement.',
  },
  {
    icon: BarChart3,
    title: 'Rapports en temps réel',
    description: 'Obtenez des insights instantanés pour une prise de décision rapide.',
  },
]

export function Hero() {
  return (
    <section className="relative pt-28 pb-16 lg:pt-36 lg:pb-24 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-50 via-white to-zinc-50/50" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_70%_-10%,rgba(59,130,246,0.08),transparent)]" />

      <div className="mx-auto max-w-[1200px] px-6 relative z-10">
        {/* Two-column hero */}
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-10 items-center">
          {/* Left — copy */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 text-xs font-semibold text-blue-600 mb-7">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              Moins de pertes, plus de ventes.
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-bold tracking-tight text-zinc-950 leading-[1.08] mb-6">
              La plateforme de gestion{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-500">
                pour distributeurs de boissons
              </span>
            </h1>

            <p className="text-lg text-zinc-500 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Stock, ventes, emballages consignés, clients et livraisons — tout dans une seule plateforme conçue pour les distributeurs Solibra &amp; Brassivoire en Côte d&apos;Ivoire.
            </p>

            <HeroCta />
          </div>

          {/* Right — laptop mockup */}
          <div className="relative">
            <div className="absolute -inset-6 bg-gradient-to-tr from-blue-500/10 via-indigo-500/10 to-transparent rounded-[2rem] blur-2xl" />
            <div className="relative mx-auto max-w-xl">
              {/* Lid / screen */}
              <div className="rounded-[14px] bg-zinc-900 p-2.5 shadow-2xl shadow-zinc-400/40 ring-1 ring-zinc-900/10">
                <div className="relative rounded-lg overflow-hidden bg-white">
                  <span className="absolute left-1/2 top-1.5 z-10 h-1 w-1 -translate-x-1/2 rounded-full bg-zinc-600/70" />
                  <img
                    src="/images/presentation.png"
                    alt="B-Stock — Tableau de bord de gestion de distribution"
                    className="w-full h-auto"
                  />
                </div>
              </div>
              {/* Base / hinge */}
              <div className="relative mx-auto h-3 w-[112%] -translate-x-[5.35%] rounded-b-2xl bg-gradient-to-b from-zinc-200 to-zinc-400 shadow-md">
                <div className="absolute left-1/2 top-0 h-1.5 w-28 -translate-x-1/2 rounded-b-lg bg-zinc-300/80" />
              </div>
            </div>
          </div>
        </div>

        {/* Highlights row */}
        <div className="mt-16 lg:mt-24 grid grid-cols-1 sm:grid-cols-3 gap-10">
          {highlights.map((h) => {
            const Icon = h.icon
            return (
              <div key={h.title} className="flex flex-col items-center text-center px-2">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-zinc-950 mb-1.5">{h.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed max-w-xs">{h.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
