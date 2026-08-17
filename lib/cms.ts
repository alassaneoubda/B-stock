import { sql } from './db'
import { getPublicPlans, type Plan } from './plans'
import { getSettings } from './settings'

export type CmsSection = {
  section_key: string
  title: string | null
  subtitle: string | null
  body: string | null
  cta_primary_label: string | null
  cta_primary_href: string | null
  cta_secondary_label: string | null
  cta_secondary_href: string | null
  image_url: string | null
  meta: Record<string, unknown>
  sort_order: number
}

export type CmsFeature = {
  id: string
  slug: string
  title: string
  description: string | null
  icon: string
  highlight: string | null
  sort_order: number
}

export type CmsFaq = {
  id: string
  question: string
  answer: string
  sort_order: number
}

export type CmsTestimonial = {
  id: string
  author_name: string
  author_role: string | null
  company_name: string | null
  quote: string
  avatar_url: string | null
  rating: number
  sort_order: number
}

export type CmsNavLink = {
  id: string
  label: string
  href: string
  location: string
  sort_order: number
}

export type LandingContent = {
  sections: Record<string, CmsSection>
  features: CmsFeature[]
  faq: CmsFaq[]
  testimonials: CmsTestimonial[]
  nav: {
    header: CmsNavLink[]
    footer_platform: CmsNavLink[]
    footer_resources: CmsNavLink[]
    footer_company: CmsNavLink[]
    footer_legal: CmsNavLink[]
  }
  plans: Plan[]
  trialDays: number
  platformName: string
}

function parseMeta(value: unknown): Record<string, unknown> {
  if (value == null) return {}
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return value as Record<string, unknown>
}

const EMPTY_LANDING: LandingContent = {
  sections: {},
  features: [],
  faq: [],
  testimonials: [],
  nav: {
    header: [],
    footer_platform: [],
    footer_resources: [],
    footer_company: [],
    footer_legal: [],
  },
  plans: [],
  trialDays: 30,
  platformName: 'B-Stock',
}

/**
 * Charge tout le contenu public de la landing.
 * Tolérant : si les tables CMS n'existent pas encore, retourne un fallback minimal.
 */
export async function getLandingContent(): Promise<LandingContent> {
  try {
    const [sectionRows, featureRows, faqRows, testimonialRows, navRows, plans, settings] =
      await Promise.all([
        sql`
          SELECT section_key, title, subtitle, body,
                 cta_primary_label, cta_primary_href,
                 cta_secondary_label, cta_secondary_href,
                 image_url, meta, sort_order
          FROM cms_sections
          WHERE is_published = true
          ORDER BY sort_order ASC
        `,
        sql`
          SELECT id, slug, title, description, icon, highlight, sort_order
          FROM cms_feature_modules
          WHERE is_published = true
          ORDER BY sort_order ASC
        `,
        sql`
          SELECT id, question, answer, sort_order
          FROM cms_faq_items
          WHERE is_published = true
          ORDER BY sort_order ASC
        `,
        sql`
          SELECT id, author_name, author_role, company_name, quote,
                 avatar_url, rating, sort_order
          FROM cms_testimonials
          WHERE is_published = true
          ORDER BY sort_order ASC
        `,
        sql`
          SELECT id, label, href, location, sort_order
          FROM cms_nav_links
          WHERE is_published = true
          ORDER BY sort_order ASC
        `,
        getPublicPlans(),
        getSettings(),
      ])

    const sections: Record<string, CmsSection> = {}
    for (const row of sectionRows) {
      const r = row as Record<string, unknown>
      sections[String(r.section_key)] = {
        section_key: String(r.section_key),
        title: (r.title as string) ?? null,
        subtitle: (r.subtitle as string) ?? null,
        body: (r.body as string) ?? null,
        cta_primary_label: (r.cta_primary_label as string) ?? null,
        cta_primary_href: (r.cta_primary_href as string) ?? null,
        cta_secondary_label: (r.cta_secondary_label as string) ?? null,
        cta_secondary_href: (r.cta_secondary_href as string) ?? null,
        image_url: (r.image_url as string) ?? null,
        meta: parseMeta(r.meta),
        sort_order: Number(r.sort_order) || 0,
      }
    }

    const nav = {
      header: [] as CmsNavLink[],
      footer_platform: [] as CmsNavLink[],
      footer_resources: [] as CmsNavLink[],
      footer_company: [] as CmsNavLink[],
      footer_legal: [] as CmsNavLink[],
    }

    for (const row of navRows) {
      const r = row as Record<string, unknown>
      const link: CmsNavLink = {
        id: String(r.id),
        label: String(r.label),
        href: String(r.href),
        location: String(r.location),
        sort_order: Number(r.sort_order) || 0,
      }
      const loc = link.location as keyof typeof nav
      if (loc in nav) nav[loc].push(link)
    }

    return {
      sections,
      features: featureRows.map((row) => {
        const r = row as Record<string, unknown>
        return {
          id: String(r.id),
          slug: String(r.slug),
          title: String(r.title),
          description: (r.description as string) ?? null,
          icon: String(r.icon || 'box'),
          highlight: (r.highlight as string) ?? null,
          sort_order: Number(r.sort_order) || 0,
        }
      }),
      faq: faqRows.map((row) => {
        const r = row as Record<string, unknown>
        return {
          id: String(r.id),
          question: String(r.question),
          answer: String(r.answer),
          sort_order: Number(r.sort_order) || 0,
        }
      }),
      testimonials: testimonialRows.map((row) => {
        const r = row as Record<string, unknown>
        return {
          id: String(r.id),
          author_name: String(r.author_name),
          author_role: (r.author_role as string) ?? null,
          company_name: (r.company_name as string) ?? null,
          quote: String(r.quote),
          avatar_url: (r.avatar_url as string) ?? null,
          rating: Number(r.rating) || 5,
          sort_order: Number(r.sort_order) || 0,
        }
      }),
      nav,
      plans,
      trialDays: settings.trial_days,
      platformName: settings.platform_name,
    }
  } catch (e) {
    console.error('[cms] getLandingContent failed — tables may be missing:', e)
    return EMPTY_LANDING
  }
}

/** Fallback marketing si CMS vide (évite landing blanche avant migration). */
export function getFallbackLandingContent(
  plans: Plan[] = [],
  trialDays = 30
): LandingContent {
  return {
    ...EMPTY_LANDING,
    trialDays,
    plans,
    platformName: 'B-Stock',
    sections: {
      hero: {
        section_key: 'hero',
        title: 'Pilotez toute votre distribution depuis une seule plateforme.',
        subtitle:
          'Stocks, ventes, clients, dépôts, livraisons et emballages consignés : B-Stock vous donne une vision complète de votre activité.',
        body: null,
        cta_primary_label: 'Commencer gratuitement',
        cta_primary_href: '#register',
        cta_secondary_label: 'Découvrir la plateforme',
        cta_secondary_href: '#product',
        image_url: '/images/presentation.png',
        meta: {
          badges: ['30 jours gratuits', 'Sans engagement', 'Données sécurisées'],
          eyebrow: 'Moins de pertes, plus de ventes.',
        },
        sort_order: 1,
      },
      cta_final: {
        section_key: 'cta_final',
        title: 'Prêt à reprendre le contrôle de votre distribution ?',
        subtitle: 'Commencez gratuitement et découvrez B-Stock.',
        body: null,
        cta_primary_label: 'Commencer gratuitement',
        cta_primary_href: '#register',
        cta_secondary_label: 'Voir les tarifs',
        cta_secondary_href: '#pricing',
        image_url: null,
        meta: {},
        sort_order: 6,
      },
    },
    nav: {
      header: [
        { id: '1', label: 'Fonctionnalités', href: '#features', location: 'header', sort_order: 1 },
        { id: '2', label: 'Tarifs', href: '#pricing', location: 'header', sort_order: 2 },
        { id: '3', label: 'À propos', href: '/a-propos', location: 'header', sort_order: 3 },
      ],
      footer_platform: [],
      footer_resources: [],
      footer_company: [],
      footer_legal: [
        { id: 'l1', label: 'CGU', href: '/cgu', location: 'footer_legal', sort_order: 1 },
        {
          id: 'l2',
          label: 'Confidentialité',
          href: '/confidentialite',
          location: 'footer_legal',
          sort_order: 2,
        },
      ],
    },
  }
}
