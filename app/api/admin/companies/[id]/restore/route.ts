import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { handleRouteError } from '@/lib/errors'
import { cancelCompanyDeletion } from '@/lib/admin/company-purge'

// POST /api/admin/companies/:id/restore — Annule une suppression programmée
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireAdmin('companies.delete')
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const restored = await cancelCompanyDeletion(id)
    await logAdminAction(authz.adminId, authz.adminEmail, 'company.cancel_deletion', 'company', id, {
      name: restored.name,
      scheduledAt: restored.scheduledAt,
    })
    return NextResponse.json({ success: true, data: { id, isSuspended: restored.is_suspended } })
  } catch (error) {
    return handleRouteError(error, 'admin.companies.restore')
  }
}
