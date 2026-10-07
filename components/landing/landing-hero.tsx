'use client'

import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthModal } from '@/components/auth/auth-modal'
import { HeroMockup } from '@/components/landing/landing-product'
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
  const title = section?.title || 'Votre stock, vos ventes et vos consignes. Enfin sous contrôle.'
  const subtitle =
    section?.subtitle ||
    'B-Stock réunit la gestion du dépôt, la caisse, les crédits clients, les emballages consignés et les livraisons — pensé pour les distributeurs, dépôts et maquis de Côte d’Ivoire.'
  const primary = section?.cta_primary_label || `Essayer gratuitement ${trialDays} jours`

  return (
    <section className="relative overflow-hidden">
      {/* Halo discret à la couleur de la marque */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-brand/15 blur-3xl"
      />
      <div className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-28 lg:pt-16">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
            Distribution de boissons · Côte d’Ivoire
          </p>
          <h1 className="mt-6 text-balance text-[clamp(2.25rem,5vw,3.75rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground">
            {title}
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">{subtitle}</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button variant="brand" size="xl" onClick={() => open('register')}>
              {primary}
              <ArrowRight aria-hidden="true" />
            </Button>
            <Button variant="outline" size="xl" asChild>
              <a href="#features">Voir les fonctionnalités</a>
            </Button>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {['Sans carte bancaire', 'Paiement par Mobile Money', 'En français, en FCFA'].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="lg:pl-6">
          <HeroMockup />
        </div>
      </div>
    </section>
  )
}
