import type { CmsSection } from '@/lib/cms'

type Step = { n: string; title: string; desc: string }

export function LandingHowItWorks({ section }: { section?: CmsSection }) {
  const title = section?.title || 'Comment démarrer'
  const subtitle =
    section?.subtitle || 'Quatre étapes pour mettre votre dépôt sous contrôle.'
  const steps =
    (section?.meta?.steps as Step[]) ||
    [
      {
        n: '01',
        title: 'Créez votre compte',
        desc: 'Inscription rapide, essai gratuit inclus.',
      },
      {
        n: '02',
        title: 'Configurez l’entreprise',
        desc: 'Dépôt principal, équipe, paramètres XOF.',
      },
      {
        n: '03',
        title: 'Ajoutez produits & clients',
        desc: 'Catalogue, emballages, fiches clients.',
      },
      {
        n: '04',
        title: 'Vendez et livrez',
        desc: 'Stock, tournées, créances au quotidien.',
      },
    ]

  return (
    <section id="comment-ca-marche" className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2563EB]">
            Prise en main
          </p>
          <h2 className="mt-3 text-[clamp(1.7rem,3vw,2.4rem)] font-bold tracking-tight text-[#0F172A]">
            {title}
          </h2>
          <p className="mt-4 text-base text-[#52525B]">{subtitle}</p>
        </div>
        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <li
              key={s.n}
              className="rounded-[1.5rem] border border-[#E7E2D9] bg-[#F7F4EF] p-6"
            >
              <span className="text-xs font-semibold text-[#2563EB]">{s.n}</span>
              <h3 className="mt-3 text-lg font-bold text-[#0F172A]">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#64748B]">{s.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
