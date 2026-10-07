'use client'

import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthModal } from '@/components/auth/auth-modal'
import type { CmsSection } from '@/lib/cms'

export function LandingCta({ section }: { section?: CmsSection }) {
  const { open } = useAuthModal()
  const title = section?.title || 'Reprenez le contrôle de votre dépôt dès cette semaine'
  const subtitle = section?.subtitle || 'Essai gratuit, sans carte bancaire. Vos premières ventes enregistrées en quelques minutes.'
  const primary = section?.cta_primary_label || 'Créer mon compte gratuit'

  return (
    <section className="px-5 py-20 sm:px-8 lg:py-24">
      <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-3xl bg-primary px-8 py-16 text-center sm:px-16 sm:py-20">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-1/2 h-72 w-[600px] -translate-x-1/2 rounded-full bg-brand/30 blur-3xl" />
        <h2 className="relative mx-auto max-w-2xl text-balance text-[clamp(1.75rem,3.5vw,2.75rem)] font-semibold leading-tight tracking-[-0.02em] text-primary-foreground">
          {title}
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-lg text-primary-foreground/70">{subtitle}</p>
        <div className="relative mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Button variant="brand" size="xl" onClick={() => open('register')}>
            {primary}
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="xl"
            asChild
            className="border-primary-foreground/20 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <a href="/contact">Parler à l’équipe</a>
          </Button>
        </div>
      </div>
    </section>
  )
}
