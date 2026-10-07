import type { CmsTestimonial } from '@/lib/cms'

/**
 * Témoignages gérés depuis l'administration (CMS). La section n'apparaît que
 * s'il y en a : n'y publier que des témoignages réels et autorisés.
 */
export function LandingTestimonials({ items }: { items: CmsTestimonial[] }) {
  if (!items.length) return null
  return (
    <section className="py-20 lg:py-24">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <p className="text-sm font-semibold text-brand-strong">Ils utilisent B-Stock</p>
        <h2 className="mt-3 max-w-2xl text-balance text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          La parole aux gérants
        </h2>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {items.map((t) => (
            <figure key={t.id} className="flex flex-col rounded-2xl border border-border bg-card p-7">
              <blockquote className="flex-1 text-[15px] leading-relaxed text-foreground">“{t.quote}”</blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t border-border pt-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                  {t.author_name.slice(0, 1)}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-foreground">{t.author_name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[t.author_role, t.company_name].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
