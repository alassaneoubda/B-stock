'use client'

import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { useAuthModal } from '@/components/auth/auth-modal'
import type { CmsSection } from '@/lib/cms'

export function LandingHero({
  section,
  trialDays,
}: {
  section?: CmsSection
  trialDays: number
  platformName?: string
}) {
  const { open } = useAuthModal()
  const title =
    section?.title || 'Pilotez toute votre distribution depuis une seule plateforme'
  const subtitle =
    section?.subtitle ||
    'Stock, ventes, clients, livraisons et emballages consignés — enfin réunis pour les distributeurs de boissons.'
  const primaryLabel = section?.cta_primary_label || 'Commencer gratuitement'

  return (
    <section className="relative min-h-[92vh] overflow-hidden bg-[#0F172A]">
      <Image
        src="/images/landing/landing-hero-depot.jpg"
        alt="Gérant dans un dépôt de boissons"
        fill
        priority
        className="object-cover object-[center_30%]"
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-[#0F172A]/55 to-[#0F172A]/25" />
      <div className="absolute inset-0 bg-[#0F172A]/20" />

      <div className="relative mx-auto flex min-h-[92vh] max-w-[900px] flex-col items-center justify-center px-6 pb-20 pt-28 text-center">
        <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
          Distribution de boissons · Côte d&apos;Ivoire
        </p>
        <h1 className="text-balance text-[clamp(2.1rem,5.5vw,3.75rem)] font-bold leading-[1.08] tracking-tight text-white">
          {title}
        </h1>
        <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-white/80 sm:text-lg">
          {subtitle}
        </p>
        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <Button
            onClick={() => open('register')}
            className="h-12 rounded-full bg-white px-8 text-sm font-semibold text-[#0F172A] hover:bg-white/90"
          >
            {primaryLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <a
            href="#solutions"
            className="inline-flex h-12 items-center rounded-full border border-white/30 px-7 text-sm font-semibold text-white hover:bg-white/10"
          >
            Découvrir B-Stock
          </a>
        </div>
        <p className="mt-6 text-sm text-white/55">
          Essai {trialDays} jours · Sans engagement · Données sécurisées
        </p>
      </div>
    </section>
  )
}
