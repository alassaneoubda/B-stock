import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AdminShell } from '@/components/admin/admin-shell'

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user?.isPlatformAdmin) {
    redirect('/admin/login')
  }

  return <AdminShell adminName={session.user.name || session.user.email}>{children}</AdminShell>
}
