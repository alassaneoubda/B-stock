import type { CmsSection } from '@/lib/cms'

export function LandingBeforeAfter({ section }: { section?: CmsSection }) {
  const title = section?.title || 'Avant / Avec B-Stock'
  const subtitle =
    section?.subtitle || 'Passez d’une gestion dispersée à une plateforme centralisée.'
  const before =
    (section?.meta?.before as string[]) ||
    [
      'Fichiers Excel',
      'Registres papier',
      'Données dispersées',
      'Stock difficile à suivre',
      'Créances difficiles à contrôler',
    ]
  const after =
    (section?.meta?.after as string[]) ||
    [
      'Données centralisées',
      'Stock en temps réel',
      'Ventes suivies',
      'Clients centralisés',
      'Livraisons organisées',
      'Rapports disponibles',
    ]

  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-[1120px] px-6">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2563EB]">
            Comparaison
          </p>
          <h2 className="mt-4 font-[family-name:var(--landing-display)] text-[clamp(1.75rem,3.5vw,2.5rem)] font-normal tracking-tight text-[#0F172A]">
            {title}
          </h2>
          <p className="mt-4 text-base text-[#52525B]">{subtitle}</p>
        </div>

        <div className="mt-12 grid gap-0 border border-[#1A1A1A]/12 md:grid-cols-2">
          <div className="border-b border-[#1A1A1A]/12 bg-[#FAFAF9] p-8 md:border-b-0 md:border-r">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A1A1AA]">
              Avant
            </h3>
            <ul className="mt-6 space-y-3">
              {before.map((item) => (
                <li key={item} className="text-sm text-[#71717A] line-through decoration-[#D4D4D8]">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-[#F3EFE7] p-8">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2563EB]">
              Avec B-Stock
            </h3>
            <ul className="mt-6 space-y-3">
              {after.map((item) => (
                <li key={item} className="text-sm font-medium text-[#0F172A]">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
