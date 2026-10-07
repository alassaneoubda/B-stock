import type { Metadata } from 'next'
import Link from 'next/link'
import { MonitorOff } from 'lucide-react'
import { requirePageSession } from '@/lib/page-auth'
import { companyHasFeature } from '@/lib/company-features'
import { AuthProvider } from '@/components/providers/session-provider'
import { PermissionsProvider } from '@/components/providers/permissions-provider'
import { PosApp } from '@/components/pos/pos-app'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Point de vente — B-Stock' }

// Plein écran, sans menu : pensé pour la tablette ou l'ordinateur du comptoir.
export default async function PosPage() {
  const session = await requirePageSession()

  // Fonctionnalité désactivée par la plateforme (back-office → Fonctionnalités)
  if (!(await companyHasFeature(session.user.companyId!, 'pos'))) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <MonitorOff className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Point de vente non activé</h1>
            <p className="text-sm text-muted-foreground">
              Le point de vente n&apos;est pas activé pour votre compte. Contactez l&apos;équipe B-Stock si vous
              souhaitez l&apos;utiliser pour votre maquis ou votre bar.
            </p>
          </div>
          <Button asChild>
            <Link href="/dashboard">Retour au tableau de bord</Link>
          </Button>
        </div>
      </main>
    )
  }

  return (
    <AuthProvider session={session}>
      <PermissionsProvider permissions={session.access.permissions}>
        <PosApp />
      </PermissionsProvider>
    </AuthProvider>
  )
}
