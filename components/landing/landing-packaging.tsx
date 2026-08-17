import type { CmsSection } from '@/lib/cms'

export function LandingPackaging({ section }: { section?: CmsSection }) {
  const title = section?.title || 'Les emballages consignés, enfin maîtrisés'
  const subtitle =
    section?.subtitle ||
    'Suivez le cycle complet des casiers et bouteilles : du dépôt au client, puis le retour.'
  const body =
    section?.body ||
    'B-Stock sépare clairement les comptes produits et emballages. C’est souvent là que les dépôts perdent de l’argent sans le voir.'
  const cycle =
    (section?.meta?.cycle as string[]) ||
    ['Dépôt', 'Livraison', 'Client', 'Consigne', 'Retour', 'Dépôt']

  return (
    <section id="packaging" className="bg-[#F3EFE7] py-20 lg:py-28">
      <div className="mx-auto grid max-w-[1120px] gap-12 px-6 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2563EB]">
            Différenciant métier
          </p>
          <h2 className="mt-4 font-[family-name:var(--landing-display)] text-[clamp(1.75rem,3.5vw,2.5rem)] font-normal tracking-tight text-[#0F172A]">
            {title}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[#3F3F46]">{subtitle}</p>
          <p className="mt-4 text-sm leading-relaxed text-[#52525B]">{body}</p>
        </div>

        <ol className="border border-[#1A1A1A]/12 bg-white/50">
          {cycle.map((step, i) => (
            <li
              key={`${step}-${i}`}
              className="flex items-baseline gap-5 border-b border-[#1A1A1A]/10 px-5 py-4 last:border-b-0"
            >
              <span className="w-6 font-mono text-xs text-[#2563EB]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="font-[family-name:var(--landing-display)] text-lg text-[#0F172A]">
                {step}
              </span>
              {i < cycle.length - 1 && (
                <span className="ml-auto text-xs text-[#A1A1AA]">puis</span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
