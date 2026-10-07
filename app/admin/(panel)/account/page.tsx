import { ADMIN_ROLE_LABELS } from '@/lib/admin-auth'
import { AdminAccountClient } from './account-client'

export const metadata = { title: 'Mon compte — Administration B-Stock' }

export default function AdminAccountPage() {
  return <AdminAccountClient roleLabels={ADMIN_ROLE_LABELS} />
}
