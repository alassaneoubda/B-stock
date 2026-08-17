import type { CmsTestimonial } from '@/lib/cms'

export function LandingTestimonials({ items }: { items: CmsTestimonial[] }) {
  if (!items.length) return null

  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-[1180px] px-6">
        <h2 className="max-w-xl text-[clamp(1.7rem,3vw,2.25rem)] font-bold tracking-tight text-[#0F172A]">
          Ce que disent les distributeurs
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {items.map((t) => (
            <blockquote
              key={t.id}
              className="flex flex-col rounded-[1.75rem] border border-[#E7E2D9] bg-[#F7F4EF] p-7"
            >
              <p className="flex-1 text-sm leading-relaxed text-[#3F3F46]">“{t.quote}”</p>
              <footer className="mt-6 border-t border-[#E7E2D9] pt-4">
                <p className="text-sm font-semibold text-[#0F172A]">{t.author_name}</p>
                <p className="text-xs text-[#64748B]">
                  {[t.author_role, t.company_name].filter(Boolean).join(' · ')}
                </p>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  )
}
