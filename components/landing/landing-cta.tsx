'use client'

import { Button } from '@/components/ui/button'
import { useAuthModal } from '@/components/auth/auth-modal'
import type { CmsSection } from '@/lib/cms'

export function LandingCta({ section }: { section?: CmsSection }) {
  const { open } = useAuthModal()
  const title =
    section?.title || 'Prêt à reprendre le contrôle de votre distribution ?'
  const subtitle =
    section?.subtitle || 'Créez votre compte et essayez B-Stock gratuitement.'
  const primary = section?.cta_primary_label || 'Commencer gratuitement'

  return (
    <section className="bg-[#F7F4EF] py-10 lg:py-16">
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="overflow-hidden rounded-[2rem] bg-[#2563EB] px-8 py-14 text-center sm:px-16 sm:py-16">
          <h2 className="mx-auto max-w-2xl text-[clamp(1.7rem,3.5vw,2.5rem)] font-bold leading-[1.15] tracking-tight text-white">
            {title}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base text-blue-100">{subtitle}</p>
          <Button
            onClick={() => open('register')}
            className="mt-8 h-12 rounded-full bg-white px-8 text-sm font-semibold text-[#0F172A] hover:bg-white/90"
          >
            {primary}
          </Button>
        </div>
      </div>
    </section>
  )
}
