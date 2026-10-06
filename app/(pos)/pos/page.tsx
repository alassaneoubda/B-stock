import type { Metadata } from 'next'
import { requirePageSession } from '@/lib/page-auth'
import { AuthProvider } from '@/components/providers/session-provider'
import { PermissionsProvider } from '@/components/providers/permissions-provider'
import { PosApp } from '@/components/pos/pos-app'

export const metadata: Metadata = { title: 'Point de vente — B-Stock' }

// Plein écran, sans menu : pensé pour la tablette ou l'ordinateur du comptoir.
export default async function PosPage() {
  const session = await requirePageSession()
  return (
    <AuthProvider session={session}>
      <PermissionsProvider permissions={session.access.permissions}>
        <PosApp />
      </PermissionsProvider>
    </AuthProvider>
  )
}
