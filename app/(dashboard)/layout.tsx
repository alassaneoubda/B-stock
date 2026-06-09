import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { DashboardSidebar } from '@/components/dashboard/sidebar-nav'
import { MobileBottomNav } from '@/components/dashboard/mobile-bottom-nav'
import { AuthProvider } from '@/components/providers/session-provider'
import { SubscriptionGate } from '@/components/dashboard/subscription-gate'
import { ImpersonationBanner } from '@/components/dashboard/impersonation-banner'
import { AnnouncementBanner } from '@/components/dashboard/announcement-banner'
import { getSettings } from '@/lib/settings'
import { Wrench } from 'lucide-react'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) {
    redirect('/login')
  }

  // Newly provisioned (e.g. Google) accounts must set their company name first
  if (session.user.onboardingCompleted === false) {
    redirect('/onboarding')
  }

  // Global maintenance mode (platform admins & impersonation sessions are exempt)
  const settings = await getSettings()
  if (settings.maintenance_mode && !session.user.isPlatformAdmin && !session.user.impersonatedBy) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
            <Wrench className="h-6 w-6 text-amber-600" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900 mb-2">Maintenance en cours</h1>
          <p className="text-sm text-zinc-500">{settings.maintenance_message}</p>
        </div>
      </div>
    )
  }

  return (
    <AuthProvider>
      {session.user.impersonatedBy && (
        <ImpersonationBanner companyName={session.user.companyName} />
      )}
      <SidebarProvider>
        <DashboardSidebar />
        <SidebarInset className="has-bottom-nav">
          <AnnouncementBanner />
          <SubscriptionGate>
            {children}
          </SubscriptionGate>
        </SidebarInset>
        <MobileBottomNav />
      </SidebarProvider>
    </AuthProvider>
  )
}
