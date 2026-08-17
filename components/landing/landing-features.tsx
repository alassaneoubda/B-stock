import {
  Warehouse,
  ShoppingCart,
  Users,
  Building2,
  Truck,
  Package,
  CreditCard,
  BarChart3,
  type LucideIcon,
} from 'lucide-react'
import type { CmsFeature } from '@/lib/cms'

const ICONS: Record<string, LucideIcon> = {
  warehouse: Warehouse,
  cart: ShoppingCart,
  users: Users,
  building: Building2,
  truck: Truck,
  package: Package,
  credit: CreditCard,
  chart: BarChart3,
  box: Package,
}

export function LandingFeatures({ features }: { features: CmsFeature[] }) {
  if (!features.length) return null

  return (
    <section id="features" className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-[1120px] px-6">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2563EB]">
            Modules
          </p>
          <h2 className="mt-4 font-[family-name:var(--landing-display)] text-[clamp(1.75rem,3.5vw,2.5rem)] font-normal tracking-tight text-[#0F172A]">
            Ce que vous gérez dans B-Stock
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[#52525B]">
            Pas une liste de buzzwords : des modules alignés sur le travail d’un dépôt de
            boissons — du casier au client, de la tournée à la créance.
          </p>
        </div>

        <div className="mt-12 divide-y divide-[#E5E7EB] border-y border-[#E5E7EB]">
          {features.map((f) => {
            const Icon = ICONS[f.icon] || Package
            return (
              <article
                key={f.id}
                className="grid gap-4 py-7 sm:grid-cols-[2.5rem_1fr_auto] sm:items-start"
              >
                <Icon className="mt-0.5 h-5 w-5 text-[#2563EB]" strokeWidth={1.75} />
                <div>
                  <h3 className="font-[family-name:var(--landing-display)] text-lg text-[#0F172A]">
                    {f.title}
                  </h3>
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[#52525B]">
                    {f.description}
                  </p>
                </div>
                {f.highlight && (
                  <span className="text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
                    {f.highlight}
                  </span>
                )}
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
