import { ADMIN_ROLE_LABELS } from '@/lib/admin-auth'
import { AdminsClient } from './admins-client'

export const metadata = { title: 'Administrateurs — Administration B-Stock' }

export default function AdminAdminsPage() {
  return <AdminsClient roleLabels={ADMIN_ROLE_LABELS} />
}
