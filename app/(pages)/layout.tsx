import { AuthModalProvider } from '@/components/auth/auth-modal'
import { LandingHeader } from '@/components/landing/landing-header'
import { LandingFooter } from '@/components/landing/landing-footer'
import { getLandingContent } from '@/lib/cms'

// Pages publiques secondaires (à propos, contact, légal…) : même en-tête et
// même pied de page que la landing.
export default async function PagesLayout({ children }: { children: React.ReactNode }) {
  const content = await getLandingContent()
  const headerLinks = content.nav.header.map((l) => (l.href.startsWith('#') ? { ...l, href: `/${l.href}` } : l))
  return (
    <AuthModalProvider>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <LandingHeader links={headerLinks} platformName={content.platformName} />
        <main className="flex-1">{children}</main>
        <LandingFooter content={content} />
      </div>
    </AuthModalProvider>
  )
}
