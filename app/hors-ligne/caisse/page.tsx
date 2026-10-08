import type { Metadata } from 'next'
import { OfflineShell } from '@/components/offline/offline-shell'

export const metadata: Metadata = { title: 'Point de vente hors ligne — B-Stock', robots: { index: false, follow: false } }

// Coquille statique SANS données (mise en cache par le service worker) :
// le catalogue et la file des ventes viennent d'IndexedDB sur l'appareil.
export const dynamic = 'force-static'

export default function OfflinePosShellPage() {
  return <OfflineShell mode="pos" />
}
