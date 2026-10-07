import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { adminCapabilities, type AdminRole } from '@/lib/admin-auth'
import { AdminShell } from '@/components/admin/admin-shell'
import { AdminRoleProvider } from '@/components/admin/admin-role'

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.isPlatformAdmin) redirect('/admin/login')

  // Rôle relu en base : un admin désactivé ou rétrogradé est pris en compte immédiatement
  const [admin] = await sql`
    SELECT role, session_version FROM platform_admins WHERE id = ${session.user.id} AND is_active = true
  `
  if (!admin || Number(admin.session_version) !== (session.user.sessionVersion ?? 0)) {
    redirect('/admin/login')
  }
  const role = admin.role as AdminRole

  return (
    <AdminRoleProvider value={{ role, capabilities: adminCapabilities(role), adminId: session.user.id }}>
      <AdminShell adminName={session.user.name || session.user.email}>{children}</AdminShell>
    </AdminRoleProvider>
  )
}
