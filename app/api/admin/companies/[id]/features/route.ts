import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { withTransaction } from '@/lib/db'
import { badRequest, handleRouteError, notFound } from '@/lib/errors'
import { isFeatureFlagKey, resolveFeatureFlags } from '@/lib/feature-flags'

const schema = z.object({ flags: z.record(z.string(), z.boolean()) })

// PATCH /api/admin/companies/:id/features — { flags: { pos: false } } (fusion avec l'existant)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireAdmin('companies.features')
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const { flags } = schema.parse(await request.json().catch(() => ({})))
    const unknown = Object.keys(flags).filter((k) => !isFeatureFlagKey(k))
    if (unknown.length > 0) throw badRequest(`Fonctionnalité inconnue : ${unknown.join(', ')}`)
    if (Object.keys(flags).length === 0) throw badRequest('Aucune fonctionnalité à modifier')

    const result = await withTransaction(async (tx) => {
      const [company] = await tx.sql`SELECT id, feature_flags FROM companies WHERE id = ${id} FOR UPDATE`
      if (!company) throw notFound('Entreprise')
      const before = resolveFeatureFlags(company.feature_flags)
      const [updated] = await tx.sql`
        UPDATE companies
        SET feature_flags = COALESCE(feature_flags, '{}'::jsonb) || ${JSON.stringify(flags)}::jsonb, updated_at = NOW()
        WHERE id = ${id}
        RETURNING feature_flags
      `
      return { before, raw: updated.feature_flags, after: resolveFeatureFlags(updated.feature_flags) }
    })

    await logAdminAction(authz.adminId, authz.adminEmail, 'company.features', 'company', id, {
      changes: flags,
      before: result.before,
    })
    return NextResponse.json({ success: true, data: { flags: result.raw, effective: result.after } })
  } catch (error) {
    return handleRouteError(error, 'admin.companies.features')
  }
}
