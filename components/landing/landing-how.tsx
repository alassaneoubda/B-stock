import type { CmsSection } from '@/lib/cms'

type Step = { n: string; title: string; desc: string }

const DEFAULT_STEPS: Step[] = [
  { n: '1', title: 'Créez votre compte', desc: 'Deux minutes, sans carte bancaire. L’essai inclut toutes les fonctionnalités.' },
  { n: '2', title: 'Ajoutez vos produits', desc: 'Choisissez dans le catalogue des boissons courantes ou créez les vôtres.' },
  { n: '3', title: 'Invitez votre équipe', desc: 'Caissiers, magasiniers, gérant : chacun avec ses droits.' },
  { n: '4', title: 'Vendez dès aujourd’hui', desc: 'Ouvrez la caisse et enregistrez vos premières ventes.' },
]

export function LandingHowItWorks({ section }: { section?: CmsSection }) {
  const title = section?.title || 'Opérationnel dans la journée'
  const subtitle = section?.subtitle || 'Pas d’installation, pas de formation longue : B-Stock fonctionne dans le navigateur.'
  const steps = (section?.meta?.steps as Step[] | undefined)?.length ? (section!.meta.steps as Step[]) : DEFAULT_STEPS

  return (
    <section id="comment-ca-marche" className="scroll-mt-20 border-y border-border bg-card py-20 lg:py-24">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-brand-strong">Démarrage</p>
          <h2 className="mt-3 text-balance text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em] text-foreground">
            {title}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">{subtitle}</p>
        </div>
        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.n} className="relative">
              <div className="flex items-center gap-3">
                <span className="tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                {i < steps.length - 1 && <span className="hidden h-px flex-1 bg-border lg:block" aria-hidden="true" />}
              </div>
              <h3 className="mt-5 font-semibold tracking-tight text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
