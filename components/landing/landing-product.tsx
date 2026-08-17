'use client'

import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { useAuthModal } from '@/components/auth/auth-modal'

/** Zone réservée — les vraies captures produit seront ajoutées plus tard. */
export function CapturePlaceholder({
  label = 'Capture de l’application — à venir',
  className = '',
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={`flex aspect-[4/5] w-full max-w-sm flex-col items-center justify-center rounded-[2rem] border border-dashed border-[#CBD5E1] bg-gradient-to-b from-white to-[#F1F5F9] px-6 text-center shadow-sm ${className}`}
    >
      <div className="mb-4 h-10 w-10 rounded-2xl bg-[#E2E8F0]" />
      <p className="text-sm font-medium text-[#64748B]">{label}</p>
      <p className="mt-2 text-xs text-[#94A3B8]">Écran réel B-Stock</p>
    </div>
  )
}

export function LandingProduct() {
  const { open } = useAuthModal()

  return (
    <section id="solutions" className="bg-[#F7F4EF] py-20 lg:py-28">
      <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-6 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2563EB]">
            Application
          </p>
          <h2 className="mt-4 text-[clamp(1.8rem,3.5vw,2.75rem)] font-bold leading-[1.12] tracking-tight text-[#0F172A]">
            Tout votre dépôt, dans une seule application
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[#52525B] sm:text-lg">
            Fini les cahiers et les Excel qui divergent. B-Stock centralise stock, ventes,
            consignes et créances pour que le gérant voie la même chose que le terrain.
          </p>
          <Button
            onClick={() => open('register')}
            className="mt-8 h-12 rounded-full bg-[#2563EB] px-7 text-sm font-semibold text-white hover:bg-[#1D4ED8]"
          >
            Ouvrir un compte gratuit
          </Button>
        </div>

        <div className="flex justify-center lg:justify-end">
          <CapturePlaceholder label="Capture mobile / dashboard — à venir" />
        </div>
      </div>
    </section>
  )
}
