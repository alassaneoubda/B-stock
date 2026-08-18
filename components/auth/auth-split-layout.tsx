import Image from 'next/image'
import { BrandLogo } from '@/components/brand-logo'
import { cn } from '@/lib/utils'

type AuthSplitLayoutProps = {
  children: React.ReactNode
  imageSrc?: string
  imageAlt?: string
  headline: string
  subline?: string
  /** Photo à gauche (login) ou à droite (register) */
  imageSide?: 'left' | 'right'
  formMaxWidth?: string
}

export function AuthSplitLayout({
  children,
  imageSrc = '/images/landing/landing-hero-depot.jpg',
  imageAlt = 'Dépôt de distribution de boissons',
  headline,
  subline,
  imageSide = 'left',
  formMaxWidth = 'max-w-[420px]',
}: AuthSplitLayoutProps) {
  const photo = (
    <aside className="relative hidden min-h-screen lg:block lg:w-[46%]">
      <Image
        src={imageSrc}
        alt={imageAlt}
        fill
        priority
        className="object-cover object-center"
        sizes="46vw"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/25" />
      <div className="absolute inset-0 bg-[#F58233]/15 mix-blend-multiply" />

      <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-12">
        <BrandLogo href="/" height={72} priority />

        <div className="max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FDBA74]">
            Distribution de boissons · Côte d’Ivoire
          </p>
          <h2 className="mt-4 text-[clamp(1.7rem,2.6vw,2.4rem)] font-bold leading-[1.15] tracking-tight text-white">
            {headline}
          </h2>
          {subline && (
            <p className="mt-4 text-sm leading-relaxed text-white/80 sm:text-base">{subline}</p>
          )}
        </div>
      </div>
    </aside>
  )

  return (
    <div className="flex min-h-screen flex-col bg-[#F7F4EF] lg:flex-row">
      {imageSide === 'left' && photo}

      <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:py-16">
        <div className={cn('mx-auto w-full', formMaxWidth)}>
          <div className="mb-8 lg:hidden">
            <BrandLogo href="/" height={64} priority />
          </div>
          <div className="rounded-[1.5rem] border border-[#E7E0D6] bg-white p-6 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.28)] sm:p-8">
            {children}
          </div>
        </div>
      </div>

      {imageSide === 'right' && photo}
    </div>
  )
}
