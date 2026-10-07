import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requirePageSession } from '@/lib/page-auth'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import { ProductCatalogSetup } from '@/components/dashboard/product-catalog-setup'

export const metadata: Metadata = { title: 'Ajouter depuis le catalogue — B-Stock' }

// Catalogue déjà chargé : ajouter d'autres produits ou des formats manquants
// (ceux déjà présents sont ignorés côté serveur).
export default async function ProductCatalogPage() {
  await requirePageSession()
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title="Ajouter depuis le catalogue"
        description="Produits et formats par conditionnement"
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard/products">
              <ArrowLeft aria-hidden="true" />
              <span className="hidden sm:inline">Retour aux produits</span>
            </Link>
          </Button>
        }
      />
      <PageShell>
        <ProductCatalogSetup redirectTo="/dashboard/products" />
      </PageShell>
    </div>
  )
}
