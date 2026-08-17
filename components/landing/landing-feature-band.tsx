import Image from 'next/image'
import { Check } from 'lucide-react'

const POINTS = [
  {
    title: 'Multi-dépôts',
    body: 'Plusieurs sites, un seul compte. Transférez le stock sans perdre le fil.',
  },
  {
    title: 'Équipe & rôles',
    body: 'Gérant, caissier, magasinier : chacun voit ce dont il a besoin.',
  },
  {
    title: 'Suivi partagé',
    body: 'Les mêmes chiffres pour le bureau et pour la tournée.',
  },
]

export function LandingFeatureBand() {
  return (
    <section className="bg-[#F7F4EF] pb-8 lg:pb-12">
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="overflow-hidden rounded-[2rem] bg-[#2563EB] text-white lg:grid lg:grid-cols-2">
          <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-14">
            <h2 className="text-[clamp(1.7rem,3vw,2.4rem)] font-bold leading-[1.15] tracking-tight">
              Simplifiez le travail entre le dépôt et l&apos;équipe
            </h2>
            <p className="mt-4 text-base leading-relaxed text-blue-100">
              Quand le stock, les ventes et les consignes vivent au même endroit, les
              discussions deviennent plus courtes — et les pertes plus rares.
            </p>
            <ul className="mt-8 space-y-5">
              {POINTS.map((p) => (
                <li key={p.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="font-semibold">{p.title}</p>
                    <p className="mt-0.5 text-sm text-blue-100/90">{p.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative min-h-[280px] sm:min-h-[360px]">
            <Image
              src="/images/landing/landing-equipe.jpg"
              alt="Équipe dans un dépôt de boissons"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
