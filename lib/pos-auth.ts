import { NextResponse } from 'next/server'
import { requirePermission, roleHasPermission, type AuthFailure } from './api-auth'
import { companyHasFeature, FEATURE_DISABLED_MESSAGES } from './company-features'
import type { PosActor } from './domain/pos'

/**
 * Utilisateur du point de vente (pos.use) + droit gérant (pos.manage).
 * Toutes les routes /api/pos/* passent ici : la fonctionnalité « pos » désactivée
 * par le back-office (companies.feature_flags) y est refusée en 403.
 */
export async function requirePosActor(): Promise<{ ok: true; actor: PosActor } | AuthFailure> {
  const authz = await requirePermission('pos.use')
  if (!authz.ok) return authz
  if (!(await companyHasFeature(authz.companyId, 'pos'))) {
    return {
      ok: false,
      response: NextResponse.json({ error: FEATURE_DISABLED_MESSAGES.pos, code: 'FEATURE_DISABLED' }, { status: 403 }),
    }
  }
  return {
    ok: true,
    actor: {
      companyId: authz.companyId,
      userId: authz.userId,
      canManage: await roleHasPermission(authz.role, 'pos.manage'),
    },
  }
}
