import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { DashboardSidebar } from '@/components/dashboard/sidebar-nav'
import { MobileBottomNav } from '@/components/dashboard/mobile-bottom-nav'
import { AuthProvider } from '@/components/providers/session-provider'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) {
    redirect('/login')
  }

  return (
    <AuthProvider>
      <SidebarProvider>
        <DashboardSidebar />
        <SidebarInset className="has-bottom-nav">
          {children}
        </SidebarInset>
        <MobileBottomNav />
      </SidebarProvider>
    </AuthProvider>
  )
}
