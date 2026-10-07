import { LandingPage, withLandingFallback } from '@/components/landing/landing-page'
import { getLandingContent } from '@/lib/cms'

export default async function HomePage() {
  // Public : uniquement le contenu publié (les brouillons sont visibles sur /preview/landing)
  const content = await withLandingFallback(await getLandingContent())
  return <LandingPage content={content} />
}
