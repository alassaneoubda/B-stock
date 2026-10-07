import { Check } from 'lucide-react'
import { PosMockup } from '@/components/landing/landing-product'

const POINTS = [
  'Plan de salle : chaque table occupée affiche son montant et sa durée',
  'Commandes en attente, complétées au fil de la soirée puis encaissées',
  'Monnaie à rendre calculée, Mobile Money et ardoise des habitués',
  'Le stock est réservé dès la commande : on ne sert pas une bouteille absente',
]

/** Mise en avant du point de vente pour maquis et bars. */
export function LandingPos() {
  return (
    <section id="pos" className="scroll-mt-20 bg-primary py-20 text-primary-foreground lg:py-28">
      <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
        <div>
          <span className="inline-flex items-center rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground">
            Nouveau · Point de vente
          </span>
          <h2 className="mt-5 text-balance text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em]">
            Pour les maquis et les bars : la caisse qui suit chaque table
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-primary-foreground/70">
            Sur une tablette au comptoir ou le téléphone du serveur. Les ventes alimentent directement le stock, la caisse et les factures.
          </p>
          <ul className="mt-8 space-y-3">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3 text-primary-foreground/90">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
                  <Check className="h-3 w-3" aria-hidden="true" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <PosMockup />
      </div>
    </section>
  )
}
