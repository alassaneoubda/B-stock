import type { Metadata } from 'next'
import { OfflineShell } from '@/components/offline/offline-shell'

export const metadata: Metadata = { title: 'Nouvelle vente hors ligne — B-Stock', robots: { index: false, follow: false } }

// Coquille statique SANS données (mise en cache par le service worker) :
// clients récents, produits et file des ventes viennent d'IndexedDB sur l'appareil.
export const dynamic = 'force-static'

export default function OfflineSaleShellPage() {
  return <OfflineShell mode="sale" />
}
