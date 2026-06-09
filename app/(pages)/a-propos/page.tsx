import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Target, Heart, ShieldCheck, Zap, ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'À propos — B-Stock',
  description: 'B-Stock, la plateforme de gestion conçue pour les distributeurs de boissons en Afrique de l’Ouest.',
}

const values = [
  {
    icon: Target,
    title: 'Conçu pour le terrain',
    desc: 'Une solution pensée avec et pour les distributeurs de boissons, au plus près de leurs réalités.',
  },
  {
    icon: ShieldCheck,
    title: 'Fiabilité',
    desc: 'Des données précises, cloisonnées et sécurisées, pour décider en confiance.',
  },
  {
    icon: Zap,
    title: 'Simplicité',
    desc: 'Une prise en main rapide, sans complexité inutile, même sur le terrain.',
  },
  {
    icon: Heart,
    title: 'Proximité',
    desc: 'Un support local qui parle votre langue et comprend votre métier.',
  },
]

export default function AProposPage() {
  return (
    <div>
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-zinc-200/60 bg-gradient-to-b from-zinc-50 to-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-20%,rgba(59,130,246,0.08),transparent)]" />
        <div className="relative mx-auto max-w-3xl px-6 py-14 sm:py-20 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950">
            Moins de pertes, plus de ventes.
          </h1>
          <p className="mt-4 text-lg text-zinc-500 leading-relaxed">
            B-Stock est née d&apos;un constat simple : les distributeurs de boissons méritent un outil à
            la hauteur de leur activité, capable de suivre stock, ventes, emballages consignés et
            livraisons sans casse-tête.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        {/* Mission */}
        <section className="mb-14">
          <h2 className="text-xl font-bold text-zinc-950 mb-3">Notre mission</h2>
          <p className="text-[15px] text-zinc-600 leading-relaxed mb-4">
            Donner aux distributeurs et dépôts de boissons en Côte d&apos;Ivoire et en Afrique de
            l&apos;Ouest une plateforme unique pour piloter toute leur chaîne de distribution. Fini les
            cahiers, les fichiers dispersés et les écarts de stock : tout est centralisé, à jour et
            accessible.
          </p>
          <p className="text-[15px] text-zinc-600 leading-relaxed">
            Nous gérons en particulier la <strong>double comptabilité produits pleins / emballages
            vides consignés</strong>, un enjeu central et souvent mal maîtrisé du métier.
          </p>
        </section>

        {/* Values */}
        <section className="mb-14">
          <h2 className="text-xl font-bold text-zinc-950 mb-5">Nos valeurs</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {values.map((v) => {
              const Icon = v.icon
              return (
                <div key={v.title} className="rounded-xl border border-zinc-200 p-5">
                  <div className="h-10 w-10 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center mb-3">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold text-zinc-950">{v.title}</h3>
                  <p className="text-sm text-zinc-500 mt-1 leading-relaxed">{v.desc}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* For whom */}
        <section className="mb-14">
          <h2 className="text-xl font-bold text-zinc-950 mb-3">Pour qui ?</h2>
          <p className="text-[15px] text-zinc-600 leading-relaxed">
            Pour les dépôts, grossistes et distributeurs de boissons — notamment partenaires Solibra
            &amp; Brassivoire — qui veulent professionnaliser leur gestion, réduire les pertes et
            accélérer leurs ventes.
          </p>
        </section>

        {/* CTA */}
        <section className="rounded-2xl bg-zinc-950 p-8 sm:p-10 text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Prêt à transformer votre distribution ?</h2>
          <p className="text-zinc-400 text-sm mb-6">Essai gratuit. Aucune carte bancaire requise.</p>
          <Link href="/">
            <Button className="h-11 px-6 bg-white text-zinc-950 hover:bg-zinc-100 font-semibold">
              Commencer maintenant
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </section>
      </div>
    </div>
  )
}
