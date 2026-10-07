import { AlertTriangle, PackageX, Receipt } from 'lucide-react'

const PAINS = [
  {
    icon: PackageX,
    problem: 'Des écarts de stock que personne n’explique',
    solution:
      'Chaque entrée et chaque sortie est tracée, lot par lot et dépôt par dépôt. Un inventaire montre l’écart réel, et le stock ne peut jamais devenir négatif.',
  },
  {
    icon: AlertTriangle,
    problem: 'Des casiers qui dorment chez les clients',
    solution:
      'Les emballages consignés ont leur propre compte : ce qui est sorti, ce qui est revenu, ce que chaque client doit encore. Plus de casiers oubliés.',
  },
  {
    icon: Receipt,
    problem: 'Des crédits notés sur un cahier',
    solution:
      'Chaque vente à crédit crée une créance avec son échéance. Vous savez qui doit combien, depuis quand, et à qui ne plus livrer.',
  },
]

/** « Ce que B-Stock règle » : les problèmes du terrain, en face de la solution. */
export function LandingFeatureBand() {
  return (
    <section className="border-y border-border bg-card py-20 lg:py-24">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-brand-strong">Pourquoi B-Stock</p>
          <h2 className="mt-3 text-balance text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em] text-foreground">
            Là où un dépôt perd de l’argent sans le voir
          </h2>
        </div>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
          {PAINS.map((p) => (
            <div key={p.problem} className="flex flex-col bg-card p-7">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
                <p.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">{p.problem}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{p.solution}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
