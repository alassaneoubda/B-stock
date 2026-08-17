import Link from 'next/link'
import type { CmsNavLink, CmsSection, LandingContent } from '@/lib/cms'
import { BrandLogo } from '@/components/brand-logo'

function Col({ title, links }: { title: string; links: CmsNavLink[] }) {
  if (!links.length) return null
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94A3B8]">
        {title}
      </p>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.id}>
            <Link href={l.href} className="text-sm text-[#475569] hover:text-[#0F172A]">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LandingFooter({
  content,
}: {
  content: Pick<LandingContent, 'nav' | 'platformName' | 'sections'>
}) {
  const footer = content.sections.footer as CmsSection | undefined

  return (
    <footer className="bg-[#F7F4EF]">
      <div className="mx-auto max-w-[1180px] px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <BrandLogo href="/" height={96} />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#64748B]">
              {footer?.subtitle ||
                'La plateforme de gestion pour distributeurs de boissons en Afrique de l’Ouest.'}
            </p>
          </div>
          <Col title="Plateforme" links={content.nav.footer_platform} />
          <Col title="Ressources" links={content.nav.footer_resources} />
          <Col title="Entreprise" links={content.nav.footer_company} />
          <Col title="Légal" links={content.nav.footer_legal} />
        </div>
      </div>
      <div className="bg-[#0F172A] py-5 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} {content.platformName}. Tous droits réservés.
      </div>
    </footer>
  )
}
