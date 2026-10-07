import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: async () => null }))

/** Administrateur simulé : le contrôle réel (session + base) est couvert ailleurs. */
const adminActor = { adminId: '', adminEmail: 'actor@admin.test', role: 'super_admin' as 'super_admin' | 'support' | 'finance' }

vi.mock('@/lib/admin-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin-auth')>()
  const { NextResponse } = await import('next/server')
  const requireAdmin = async (capability?: Parameters<typeof actual.adminCan>[1]) => {
    if (capability && !actual.adminCan(adminActor.role, capability)) {
      return { ok: false as const, response: NextResponse.json({ error: 'Votre rôle ne permet pas cette action' }, { status: 403 }) }
    }
    return {
      ok: true as const,
      session: {} as never,
      adminId: adminActor.adminId,
      adminEmail: adminActor.adminEmail,
      role: adminActor.role,
    }
  }
  return {
    ...actual,
    requireAdmin,
    requireSuperAdmin: async () => requireAdmin('admins.manage'),
  }
})

import { sql } from '@/lib/db'
import { createPasswordResetLink } from '@/lib/password-reset'
import { currentTotp } from '@/lib/totp'
import { createTenant } from './helpers'
import { POST as forgotPassword } from '@/app/api/auth/forgot-password/route'
import { POST as resetPassword } from '@/app/api/auth/reset-password/route'
import { PATCH as patchAdmin } from '@/app/api/admin/admins/[id]/route'
import { POST as setup2fa } from '@/app/api/admin/account/2fa/setup/route'
import { POST as enable2fa } from '@/app/api/admin/account/2fa/enable/route'
import { POST as impersonate } from '@/app/api/admin/companies/[id]/impersonate/route'

function req(body: unknown, ip = '10.0.0.1') {
  return new NextRequest('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify(body),
  })
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })
async function json(res: Response) {
  return { status: res.status, body: (await res.json()) as any }
}

const createdAdmins: string[] = []
async function createAdmin(role: 'super_admin' | 'support' | 'finance' = 'super_admin', isActive = true) {
  const suffix = randomUUID().slice(0, 8)
  const [row] = await sql`
    INSERT INTO platform_admins (email, full_name, password_hash, role, is_active)
    VALUES (${`admin-${suffix}@admin.test`}, 'Admin test', 'x', ${role}, ${isActive})
    RETURNING id, email
  `
  createdAdmins.push(row.id)
  return { id: row.id as string, email: row.email as string }
}

afterAll(async () => {
  if (createdAdmins.length) {
    await sql`DELETE FROM platform_audit_logs WHERE admin_id = ANY(${createdAdmins}::uuid[])`.catch(() => {})
    await sql`DELETE FROM platform_admins WHERE id = ANY(${createdAdmins}::uuid[])`
  }
})

// Acteur réel en base (clé étrangère du journal plateforme), inactif pour ne pas
// compter parmi les super-admins actifs ; son rôle effectif est simulé.
let actorId = ''
beforeAll(async () => {
  actorId = (await createAdmin('support', false)).id
})

beforeEach(() => {
  adminActor.role = 'super_admin'
  adminActor.adminId = actorId
})

describe('Mot de passe oublié (libre-service)', () => {
  it('même réponse pour un email inconnu et un email connu ; jeton créé seulement pour le compte connu', async () => {
    const t = await createTenant()
    const [owner] = await sql`SELECT email FROM users WHERE id = ${t.userId}`

    const unknown = await json(await forgotPassword(req({ email: `inconnu-${randomUUID().slice(0, 8)}@test.local` }, '10.0.1.1')))
    const known = await json(await forgotPassword(req({ email: String(owner.email).toUpperCase() }, '10.0.1.2')))

    expect(unknown.status).toBe(200)
    expect(known.status).toBe(200)
    expect(known.body).toEqual(unknown.body)

    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM password_reset_tokens WHERE user_id = ${t.userId}`
    expect(n).toBe(1)
  })

  it('les administrateurs de la plateforme sont exclus', async () => {
    const admin = await createAdmin('support')
    const res = await json(await forgotPassword(req({ email: admin.email }, '10.0.1.3')))
    expect(res.status).toBe(200)
    const [{ n }] = await sql`
      SELECT COUNT(*)::int AS n FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
      WHERE lower(u.email) = ${admin.email}
    `
    expect(n).toBe(0)
  })
})

describe('Réinitialisation par lien', () => {
  it('le jeton ne sert qu’une fois', async () => {
    const t = await createTenant()
    const { url } = await createPasswordResetLink(t.userId)
    const token = url.split('/').pop()!

    const first = await json(await resetPassword(req({ token, password: 'NouveauMdp2026' }, '10.0.2.1')))
    expect(first.status).toBe(200)
    const second = await json(await resetPassword(req({ token, password: 'AutreMdp2026' }, '10.0.2.1')))
    expect(second.status).toBe(400)
    expect(second.body.code).toBe('INVALID_TOKEN')

    const [user] = await sql`SELECT session_version FROM users WHERE id = ${t.userId}`
    expect(user.session_version).toBe(1)
  })
})

describe('Gestion des administrateurs', () => {
  it('refuse de se rétrograder ou de se désactiver soi-même', async () => {
    const me = await createAdmin('super_admin')
    adminActor.adminId = me.id

    const demote = await json(await patchAdmin(req({ role: 'support' }), params(me.id)))
    expect(demote.status).toBe(400)
    expect(demote.body.code).toBe('SELF_PROTECTED')

    const deactivate = await json(await patchAdmin(req({ is_active: false }), params(me.id)))
    expect(deactivate.status).toBe(400)

    const [row] = await sql`SELECT role, is_active FROM platform_admins WHERE id = ${me.id}`
    expect(row).toMatchObject({ role: 'super_admin', is_active: true })
  })

  it('refuse de retirer le dernier super-administrateur actif', async () => {
    const target = await createAdmin('super_admin')
    // Isole la cible comme seul super-admin actif le temps du test
    const others = await sql`
      UPDATE platform_admins SET is_active = false
      WHERE role = 'super_admin' AND is_active = true AND id <> ${target.id}
      RETURNING id
    `
    const otherIds = others.map((o) => o.id as string)
    try {
      const demote = await json(await patchAdmin(req({ role: 'finance' }), params(target.id)))
      expect(demote.status).toBe(409)
      expect(demote.body.code).toBe('LAST_SUPER_ADMIN')

      const deactivate = await json(await patchAdmin(req({ is_active: false }), params(target.id)))
      expect(deactivate.status).toBe(409)

      // Avec un deuxième super-admin actif, la rétrogradation passe et ferme les sessions
      await createAdmin('super_admin')
      const ok = await json(await patchAdmin(req({ role: 'finance' }), params(target.id)))
      expect(ok.status).toBe(200)
      const [row] = await sql`SELECT role, session_version FROM platform_admins WHERE id = ${target.id}`
      expect(row.role).toBe('finance')
      expect(row.session_version).toBe(1)
    } finally {
      if (otherIds.length) await sql`UPDATE platform_admins SET is_active = true WHERE id = ANY(${otherIds}::uuid[])`
    }
  })

  it('réservé aux super-administrateurs', async () => {
    const target = await createAdmin('support')
    adminActor.role = 'support'
    const res = await patchAdmin(req({ force_logout: true }), params(target.id))
    expect(res.status).toBe(403)
  })
})

describe('Double authentification', () => {
  it('refuse un code faux, accepte le code courant', async () => {
    const me = await createAdmin('super_admin')
    adminActor.adminId = me.id

    const setup = await json(await setup2fa())
    expect(setup.status).toBe(200)
    expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//)

    const [row] = await sql`SELECT totp_secret, totp_enabled FROM platform_admins WHERE id = ${me.id}`
    expect(row.totp_enabled).toBe(false)
    const secret = row.totp_secret as string
    expect(setup.body.secret.replace(/\s/g, '')).toBe(secret)

    const good = currentTotp(secret)
    const wrong = String((Number(good) + 500_000) % 1_000_000).padStart(6, '0')
    const refused = await json(await enable2fa(req({ code: wrong })))
    expect(refused.status).toBe(400)
    expect((await sql`SELECT totp_enabled FROM platform_admins WHERE id = ${me.id}`)[0].totp_enabled).toBe(false)

    const accepted = await json(await enable2fa(req({ code: good })))
    expect(accepted.status).toBe(200)
    expect((await sql`SELECT totp_enabled FROM platform_admins WHERE id = ${me.id}`)[0].totp_enabled).toBe(true)
  })
})

describe('Assistance (connexion en tant que client)', () => {
  it('exige un motif et l’inscrit dans le journal de l’entreprise', async () => {
    const t = await createTenant()
    adminActor.role = 'support'

    const noReason = await impersonate(req({ reason: 'court' }), params(t.companyId))
    expect(noReason.status).toBe(400)

    const reason = 'Demande du gérant : écart de stock à vérifier'
    const res = await json(await impersonate(req({ reason }), params(t.companyId)))
    expect(res.status).toBe(200)
    expect(typeof res.body.token).toBe('string')

    const [log] = await sql`
      SELECT user_id, action, entity_type, details FROM audit_logs
      WHERE company_id = ${t.companyId} AND action = 'impersonation_started'
    `
    expect(log).toBeTruthy()
    expect(log.user_id).toBe(t.userId)
    expect(log.entity_type).toBe('support')
    expect(log.details).toMatchObject({ adminEmail: adminActor.adminEmail, reason })
    expect(typeof log.details.expiresAt).toBe('string')

    const [platformLog] = await sql`
      SELECT metadata FROM platform_audit_logs
      WHERE admin_id = ${actorId} AND action = 'impersonate' AND target_id = ${t.userId}
    `
    expect(platformLog.metadata).toMatchObject({ reason, companyId: t.companyId })
  })

  it('refusé au rôle finance', async () => {
    const t = await createTenant()
    adminActor.role = 'finance'
    const res = await impersonate(req({ reason: 'Vérification de facturation demandée' }), params(t.companyId))
    expect(res.status).toBe(403)
  })
})
