import { AuthModalProvider } from '@/components/auth/auth-modal'
import { LandingHeader } from '@/components/landing/landing-header'
import { LandingHero } from '@/components/landing/landing-hero'
import { LandingFeatureBand } from '@/components/landing/landing-feature-band'
import { LandingStories } from '@/components/landing/landing-stories'
import { LandingPos } from '@/components/landing/landing-pos'
import { LandingHowItWorks } from '@/components/landing/landing-how'
import { LandingPricing } from '@/components/landing/landing-pricing'
import { LandingTestimonials } from '@/components/landing/landing-testimonials'
import { LandingFaq } from '@/components/landing/landing-faq'
import { LandingCta } from '@/components/landing/landing-cta'
import { LandingFooter } from '@/components/landing/landing-footer'
import { getFallbackLandingContent, type LandingContent } from '@/lib/cms'
import { getPublicPlans } from '@/lib/plans'

/**
 * Complète le contenu CMS avec le contenu de secours si la section « hero »
 * est absente (base vide, migration non jouée ou hero dépublié).
 */
export async function withLandingFallback(content: LandingContent): Promise<LandingContent> {
  if (content.sections.hero) return content
  const plans = content.plans.length ? content.plans : await getPublicPlans().catch(() => [])
  return {
    ...getFallbackLandingContent(plans, content.trialDays),
    plans,
    features: content.features,
    faq: content.faq,
    testimonials: content.testimonials,
    nav: content.nav.header.length ? content.nav : getFallbackLandingContent().nav,
    trialDays: content.trialDays,
    platformName: content.platformName,
  }
}

/** Arbre de la page d'accueil, partagé par `/` (publié) et `/preview/landing` (brouillons inclus). */
export function LandingPage({ content }: { content: LandingContent }) {
  return (
    <AuthModalProvider>
      <div className="min-h-screen bg-background text-foreground">
        <LandingHeader links={content.nav.header} platformName={content.platformName} />
        <main>
          <LandingHero section={content.sections.hero} trialDays={content.trialDays} platformName={content.platformName} />
          <LandingFeatureBand />
          <LandingStories features={content.features} />
          <LandingPos />
          <LandingHowItWorks section={content.sections.how_it_works} />
          <LandingPricing plans={content.plans} />
          <LandingTestimonials items={content.testimonials} />
          <LandingFaq items={content.faq} />
          <LandingCta section={content.sections.cta_final} />
        </main>
        <LandingFooter content={content} />
      </div>
    </AuthModalProvider>
  )
}
