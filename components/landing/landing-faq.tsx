import type { CmsFaq } from '@/lib/cms'

export function LandingFaq({ items }: { items: CmsFaq[] }) {
  if (!items.length) return null

  return (
    <section id="faq" className="bg-[#F7F4EF] py-20">
      <div className="mx-auto max-w-[720px] px-6">
        <h2 className="text-center text-[clamp(1.7rem,3vw,2.25rem)] font-bold tracking-tight text-[#0F172A]">
          Questions fréquentes
        </h2>
        <div className="mt-10 space-y-3">
          {items.map((item) => (
            <details
              key={item.id}
              className="group rounded-2xl border border-[#E7E2D9] bg-white open:shadow-sm"
            >
              <summary className="cursor-pointer list-none px-6 py-5 font-semibold text-[#0F172A]">
                <span className="flex items-center justify-between gap-4">
                  {item.question}
                  <span className="text-xl text-[#2563EB] transition-transform group-open:rotate-45">
                    +
                  </span>
                </span>
              </summary>
              <div className="px-6 pb-5 text-sm leading-relaxed text-[#52525B]">
                {item.answer}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
