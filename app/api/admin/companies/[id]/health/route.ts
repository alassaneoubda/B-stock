import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { handleRouteError, notFound } from '@/lib/errors'
import { getCompanyHealth, HEALTH_RULES } from '@/lib/admin/company-health'

// GET /api/admin/companies/:id/health — Santé du compte (activité, ventes, démarrage)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireAdmin('companies.read')
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const health = (await getCompanyHealth([id])).get(id)
    if (!health) throw notFound('Entreprise')
    return NextResponse.json({ success: true, data: health, rules: HEALTH_RULES })
  } catch (error) {
    return handleRouteError(error, 'admin.companies.health')
  }
}
