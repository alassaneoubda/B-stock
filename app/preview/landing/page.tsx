import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Eye } from 'lucide-react'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { getLandingContent } from '@/lib/cms'
import { LandingPage, withLandingFallback } from '@/components/landing/landing-page'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Aperçu de la page d’accueil',
  robots: { index: false, follow: false },
}

/**
 * Aperçu de la landing avec les brouillons du CMS.
 * Hors du layout du back-office (pas de menu admin) ; réservé aux administrateurs
 * actifs de la plateforme : pour tout autre visiteur, la page n'existe pas (404).
 */
export default async function LandingPreviewPage() {
  const session = await auth()
  if (!session?.user?.isPlatformAdmin) notFound()

  const [admin] = await sql`
    SELECT session_version FROM platform_admins WHERE id = ${session.user.id} AND is_active = true
  `
  if (!admin || Number(admin.session_version) !== (session.user.sessionVersion ?? 0)) notFound()

  const content = await withLandingFallback(await getLandingContent({ includeDrafts: true }))

  return (
    <>
      <div
        role="status"
        className="sticky top-0 z-[60] flex h-10 items-center justify-center gap-4 overflow-hidden border-b border-warning/40 bg-warning-soft px-4 text-xs text-warning-foreground sm:text-sm"
      >
        <span className="inline-flex min-w-0 items-center gap-2 truncate font-medium">
          <Eye className="h-4 w-4" aria-hidden="true" />
          Aperçu — brouillons inclus, non visible du public
        </span>
        <Link
          href="/admin/cms"
          className="inline-flex shrink-0 items-center gap-1 font-medium underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Retour au CMS
        </Link>
      </div>
      {/* L'en-tête collant de la landing se place sous le bandeau d'aperçu (h-10) */}
      <div className="[&_header]:top-10">
        <LandingPage content={content} />
      </div>
    </>
  )
}
