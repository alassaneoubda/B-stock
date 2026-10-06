import { vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Simule l'utilisateur connecté pour appeler directement les handlers de route.
 * Le contrôle d'accès réel (lib/api-auth) est testé séparément ; ici on teste
 * la logique métier et l'isolation des données de chaque route.
 */
export const actor = { companyId: '', userId: '', role: 'owner' as string }

export function actAs(t: { companyId: string; userId: string }, role = 'owner') {
  actor.companyId = t.companyId
  actor.userId = t.userId
  actor.role = role
}

vi.mock('@/lib/api-auth', () => {
  const ok = async () => ({
    ok: true,
    companyId: actor.companyId,
    userId: actor.userId,
    role: actor.role,
    isImpersonating: false,
    session: { user: { id: actor.userId, companyId: actor.companyId, role: actor.role, name: 'Test', email: 't@test.local' } },
  })
  return {
    requireAuth: ok,
    requirePermission: ok,
    requireOwner: ok,
    roleHasPermission: async () => true,
  }
})

export function req(method: string, body?: unknown, url = 'http://localhost/api/test') {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export const params = (id: string) => ({ params: Promise.resolve({ id }) })

export async function json(res: Response) {
  return { status: res.status, body: (await res.json()) as any }
}
