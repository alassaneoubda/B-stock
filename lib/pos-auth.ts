import { requirePermission, roleHasPermission, type AuthFailure } from './api-auth'
import type { PosActor } from './domain/pos'

/** Utilisateur du point de vente (pos.use) + droit gérant (pos.manage). */
export async function requirePosActor(): Promise<{ ok: true; actor: PosActor } | AuthFailure> {
  const authz = await requirePermission('pos.use')
  if (!authz.ok) return authz
  return {
    ok: true,
    actor: {
      companyId: authz.companyId,
      userId: authz.userId,
      canManage: await roleHasPermission(authz.role, 'pos.manage'),
    },
  }
}
