import { AuthModalProvider } from '@/components/auth/auth-modal'
import { LandingHeader } from '@/components/landing/landing-header'
import { LandingHero } from '@/components/landing/landing-hero'
import { LandingProduct } from '@/components/landing/landing-product'
import { LandingFeatureBand } from '@/components/landing/landing-feature-band'
import { LandingStories } from '@/components/landing/landing-stories'
import { LandingHowItWorks } from '@/components/landing/landing-how'
import { LandingPricing } from '@/components/landing/landing-pricing'
import { LandingTestimonials } from '@/components/landing/landing-testimonials'
import { LandingFaq } from '@/components/landing/landing-faq'
import { LandingCta } from '@/components/landing/landing-cta'
import { LandingFooter } from '@/components/landing/landing-footer'
import { getFallbackLandingContent, getLandingContent } from '@/lib/cms'
import { getPublicPlans } from '@/lib/plans'

export default async function HomePage() {
  let content = await getLandingContent()

  if (!content.sections.hero) {
    const plans = content.plans.length ? content.plans : await getPublicPlans().catch(() => [])
    content = {
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

  return (
    <AuthModalProvider>
      <div className="min-h-screen bg-[#F7F4EF] text-[#111827]">
        <LandingHeader links={content.nav.header} platformName={content.platformName} />
        <main>
          <LandingHero
            section={content.sections.hero}
            trialDays={content.trialDays}
            platformName={content.platformName}
          />
          <LandingProduct />
          <LandingFeatureBand />
          <LandingStories features={content.features} />
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
