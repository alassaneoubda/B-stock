import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export function LegalPage({
  title,
  subtitle,
  updated,
  children,
}: {
  title: string
  subtitle?: string
  updated?: string
  children: React.ReactNode
}) {
  return (
    <article>
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-zinc-200/60 bg-gradient-to-b from-zinc-50 to-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-20%,rgba(59,130,246,0.08),transparent)]" />
        <div className="relative mx-auto max-w-3xl px-6 py-12 sm:py-16">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à l&apos;accueil
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950">{title}</h1>
          {subtitle && <p className="mt-3 text-lg text-zinc-500 leading-relaxed">{subtitle}</p>}
          {updated && <p className="mt-4 text-xs text-zinc-400">Dernière mise à jour : {updated}</p>}
        </div>
      </header>

      {/* Content */}
      <div
        className="mx-auto max-w-3xl px-6 py-12 sm:py-16
          [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-zinc-950 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:scroll-mt-24
          [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-zinc-900 [&_h3]:mt-6 [&_h3]:mb-2
          [&_p]:text-[15px] [&_p]:text-zinc-600 [&_p]:leading-relaxed [&_p]:mb-4
          [&_ul]:my-4 [&_ul]:space-y-2 [&_ul]:pl-1
          [&_li]:flex [&_li]:gap-2.5 [&_li]:text-[15px] [&_li]:text-zinc-600 [&_li]:leading-relaxed
          [&_a]:text-blue-600 [&_a]:font-medium hover:[&_a]:underline
          [&_strong]:font-semibold [&_strong]:text-zinc-900"
      >
        {children}
      </div>
    </article>
  )
}

/** Puce de liste stylée (alignée avec le sélecteur [&_li] du conteneur). */
export function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li>
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
      <span>{children}</span>
    </li>
  )
}
