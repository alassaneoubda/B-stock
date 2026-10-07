import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { requirePageSession } from '@/lib/page-auth'
import { AuthProvider } from '@/components/providers/session-provider'
import { PermissionsProvider } from '@/components/providers/permissions-provider'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { DashboardSidebar } from '@/components/dashboard/sidebar-nav'
import { MobileBottomNav } from '@/components/dashboard/mobile-bottom-nav'
import { SubscriptionGate } from '@/components/dashboard/subscription-gate'
import { ImpersonationBanner } from '@/components/dashboard/impersonation-banner'
import { AnnouncementBanner } from '@/components/dashboard/announcement-banner'
import { getSettings } from '@/lib/settings'
import { companyHasFeature } from '@/lib/company-features'
import { Wrench } from 'lucide-react'
import { ForbiddenNotice } from '@/components/dashboard/forbidden-notice'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requirePageSession()

  // Newly provisioned (e.g. Google) accounts must set their company name first
  if (session.user.onboardingCompleted === false) {
    redirect('/onboarding')
  }

  // Global maintenance mode (platform admins & impersonation sessions are exempt)
  const settings = await getSettings()
  if (settings.maintenance_mode && !session.user.isPlatformAdmin && !session.user.impersonatedBy) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/50 p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-warning-soft">
            <Wrench className="h-6 w-6 text-warning-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Maintenance en cours</h1>
          <p className="text-sm text-muted-foreground">{settings.maintenance_message}</p>
        </div>
      </div>
    )
  }

  // Fonctionnalité « Point de vente » (activable par entreprise depuis le back-office)
  const posEnabled = await companyHasFeature(session.user.companyId!, 'pos')

  return (
    <AuthProvider session={session}>
      <PermissionsProvider permissions={session.access.permissions}>
      {session.user.impersonatedBy && (
        <ImpersonationBanner companyName={session.user.companyName} />
      )}
      <SidebarProvider defaultOpen>
        <DashboardSidebar user={session.user} permissions={session.access.permissions} posEnabled={posEnabled} />
        <SidebarInset className="has-bottom-nav">
          <Suspense fallback={null}>
            <ForbiddenNotice />
          </Suspense>
          <AnnouncementBanner />
          <SubscriptionGate>
            {children}
          </SubscriptionGate>
        </SidebarInset>
        <MobileBottomNav permissions={session.access.permissions} />
      </SidebarProvider>
      </PermissionsProvider>
    </AuthProvider>
  )
}
