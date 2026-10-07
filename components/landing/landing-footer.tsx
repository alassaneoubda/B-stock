import Link from 'next/link'
import type { CmsNavLink, CmsSection, LandingContent } from '@/lib/cms'
import { BrandLogo } from '@/components/brand-logo'

const DEFAULT_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Produit',
    links: [
      { label: 'Fonctionnalités', href: '/#features' },
      { label: 'Point de vente', href: '/#pos' },
      { label: 'Tarifs', href: '/#pricing' },
    ],
  },
  {
    title: 'Ressources',
    links: [
      { label: 'Guide de démarrage', href: '/guide' },
      { label: 'Support', href: '/support' },
      { label: 'Questions fréquentes', href: '/#faq' },
    ],
  },
  {
    title: 'Entreprise',
    links: [
      { label: 'À propos', href: '/a-propos' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Légal',
    links: [
      { label: 'Conditions d’utilisation', href: '/cgu' },
      { label: 'Confidentialité', href: '/confidentialite' },
    ],
  },
]

function Column({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  if (!links.length) return null
  return (
    <div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <ul className="mt-4 space-y-3">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

const toLinks = (links: CmsNavLink[]) => links.map((l) => ({ label: l.label, href: l.href }))

export function LandingFooter({
  content,
}: {
  content: Pick<LandingContent, 'nav' | 'platformName' | 'sections'>
}) {
  const footer = content.sections.footer as CmsSection | undefined
  const cmsColumns = [
    { title: 'Produit', links: toLinks(content.nav.footer_platform) },
    { title: 'Ressources', links: toLinks(content.nav.footer_resources) },
    { title: 'Entreprise', links: toLinks(content.nav.footer_company) },
    { title: 'Légal', links: toLinks(content.nav.footer_legal) },
  ]
  // Le CMS complète les colonnes ; à défaut, des liens réels par défaut
  const columns = cmsColumns.map((c, i) => (c.links.length ? c : DEFAULT_COLUMNS[i]))

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <BrandLogo href="/" height={64} />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {footer?.subtitle || 'La gestion de distribution de boissons, pensée pour les dépôts, grossistes et maquis de Côte d’Ivoire.'}
          </p>
        </div>
        {columns.map((c) => (
          <Column key={c.title} title={c.title} links={c.links} />
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© {new Date().getFullYear()} {content.platformName}. Tous droits réservés.</p>
          <p>Abidjan, Côte d’Ivoire · Paiements sécurisés par GeniusPay</p>
        </div>
      </div>
    </footer>
  )
}
