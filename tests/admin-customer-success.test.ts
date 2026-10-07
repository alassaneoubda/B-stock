import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: async () => null }))

/** Administrateur simulé (modifiable par test : rôle, identité). */
const admin = { adminId: '', adminEmail: 'cs-admin@test.local', role: 'super_admin' as 'super_admin' | 'support' | 'finance' }

vi.mock('@/lib/admin-auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/admin-auth')>()
  return {
    ...original,
    requireAdmin: async () => ({
      ok: true,
      adminId: admin.adminId,
      adminEmail: admin.adminEmail,
      role: admin.role,
      session: { user: { id: admin.adminId, email: admin.adminEmail } },
    }),
    requireSuperAdmin: async () => ({
      ok: true,
      adminId: admin.adminId,
      adminEmail: admin.adminEmail,
      role: 'super_admin',
      session: { user: { id: admin.adminId, email: admin.adminEmail } },
    }),
    logAdminAction: async () => {},
  }
})

import { actAs, json, params, req } from './route-helpers'
import { createProduct, createTenant } from './helpers'
import { sql } from '@/lib/db'
import { computeHealthLevel, getCompanyHealth } from '@/lib/admin/company-health'
import { purgeScheduledDeletions } from '@/lib/admin/company-purge'
import { toWhatsAppNumber } from '@/lib/admin/contact'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { GET as trialsGET } from '@/app/api/admin/trials/route'
import { GET as notesGET, POST as notesPOST, PATCH as notesPATCH, DELETE as notesDELETE } from '@/app/api/admin/companies/[id]/notes/route'
import { GET as searchGET } from '@/app/api/admin/search/route'
import { PATCH as featuresPATCH } from '@/app/api/admin/companies/[id]/features/route'
import { GET as posGET } from '@/app/api/pos/route'
import { DELETE as companyDELETE } from '@/app/api/admin/companies/[id]/route'
import { POST as restorePOST } from '@/app/api/admin/companies/[id]/restore/route'
import { GET as exportGET } from '@/app/api/admin/companies/[id]/export/route'
import { GET as timelineGET } from '@/app/api/admin/companies/[id]/timeline/route'
import { GET as companiesGET } from '@/app/api/admin/companies/route'

async function createAdmin(role = 'super_admin') {
  const suffix = randomUUID().slice(0, 8)
  const [row] = await sql`
    INSERT INTO platform_admins (email, full_name, password_hash, role)
    VALUES (${`cs-${suffix}@test.local`}, 'Admin CS', 'x', ${role})
    RETURNING id, email
  `
  return { id: row.id as string, email: row.email as string }
}

async function addSale(t: { companyId: string; clientId: string; depotId: string }, opts: { daysAgo?: number; total?: number; number?: string } = {}) {
  const number = opts.number ?? `CS-${randomUUID().slice(0, 10)}`
  const [row] = await sql`
    INSERT INTO sales_orders (company_id, client_id, depot_id, order_number, status, total_amount, created_at)
    VALUES (${t.companyId}, ${t.clientId}, ${t.depotId}, ${number}, 'delivered', ${opts.total ?? 1000},
            NOW() - (${opts.daysAgo ?? 0} * INTERVAL '1 day'))
    RETURNING id
  `
  return { id: row.id as string, number }
}

beforeAll(async () => {
  const a = await createAdmin()
  admin.adminId = a.id
  admin.adminEmail = a.email
  admin.role = 'super_admin'
})

describe('Santé des comptes', () => {
  it('règles pures : nouveau, inactif, à risque, actif', () => {
    expect(computeHealthLevel({ ageDays: 2, daysSinceLogin: null, daysSinceSale: null, onboardingScore: 0 }).level).toBe('new')
    expect(computeHealthLevel({ ageDays: 40, daysSinceLogin: 20, daysSinceSale: 35, onboardingScore: 4 }).level).toBe('inactive')
    expect(computeHealthLevel({ ageDays: 40, daysSinceLogin: 1, daysSinceSale: 20, onboardingScore: 4 }).level).toBe('at_risk')
    expect(computeHealthLevel({ ageDays: 40, daysSinceLogin: 1, daysSinceSale: 1, onboardingScore: 1 }).level).toBe('at_risk')
    expect(computeHealthLevel({ ageDays: 40, daysSinceLogin: 1, daysSinceSale: 2, onboardingScore: 3 }).level).toBe('active')
  })

  it('calcule nouveau / actif / inactif à partir des données', async () => {
    const fresh = await createTenant('Neuf')

    const active = await createTenant('Actif')
    await sql`UPDATE companies SET created_at = NOW() - INTERVAL '30 days' WHERE id = ${active.companyId}`
    await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${active.userId}`
    await createProduct(active.companyId, active.depotId)
    await addSale(active, { daysAgo: 2, total: 5000 })
    await addSale(active, { daysAgo: 20, total: 3000 })

    const inactive = await createTenant('Inactif')
    await sql`UPDATE companies SET created_at = NOW() - INTERVAL '60 days' WHERE id = ${inactive.companyId}`
    await sql`UPDATE users SET last_login_at = NOW() - INTERVAL '20 days' WHERE id = ${inactive.userId}`

    const health = await getCompanyHealth([fresh.companyId, active.companyId, inactive.companyId])
    expect(health.get(fresh.companyId)?.level).toBe('new')

    const a = health.get(active.companyId)!
    expect(a.level).toBe('active')
    expect(a.sales7d).toBe(1)
    expect(a.revenue7d).toBe(5000)
    expect(a.sales30d).toBe(2)
    expect(a.revenue30d).toBe(8000)
    expect(a.activeUsers).toBe(1)
    expect(a.onboarding).toMatchObject({ hasProducts: true, hasClients: true, hasSale: true, hasCashSession: false, score: 3 })
    expect(a.lastActivityAt).not.toBeNull()

    expect(health.get(inactive.companyId)?.level).toBe('inactive')
  })

  it('la liste des entreprises expose la santé et la dernière activité', async () => {
    const t = await createTenant('ListeSante')
    const res = await json(await companiesGET(req('GET', undefined, `http://localhost/api/admin/companies?search=${encodeURIComponent(t.companyId.slice(0, 8))}`)))
    expect(res.status).toBe(200)
    const row = res.body.data.find((c: any) => c.id === t.companyId)
    expect(row.health.level).toBe('new')
    expect(row.health).toHaveProperty('lastActivityAt')
  })
})

describe('Essais à convertir', () => {
  it('filtre par échéance (3 / 14 jours / expirés récemment)', async () => {
    const soon = await createTenant('EssaiBientot')
    const later = await createTenant('EssaiPlusTard')
    const expired = await createTenant('EssaiExpire')
    await sql`UPDATE companies SET trial_ends_at = NOW() + INTERVAL '2 days' WHERE id = ${soon.companyId}`
    await sql`UPDATE companies SET trial_ends_at = NOW() + INTERVAL '10 days' WHERE id = ${later.companyId}`
    await sql`UPDATE companies SET trial_ends_at = NOW() - INTERVAL '3 days' WHERE id = ${expired.companyId}`
    await sql`UPDATE users SET phone = '0701020304' WHERE id = ${soon.userId}`

    const ids = async (window: string) => {
      const res = await json(await trialsGET(req('GET', undefined, `http://localhost/api/admin/trials?window=${window}`)))
      expect(res.status).toBe(200)
      return res.body.data as any[]
    }

    const three = await ids('3')
    const row = three.find((r) => r.id === soon.companyId)
    expect(row).toBeTruthy()
    expect(row.daysLeft).toBe(2)
    expect(row.phone).toBe('0701020304')
    expect(row.ownerName).toBe('Owner')
    expect(row.health.level).toBe('new')
    expect(three.some((r) => r.id === later.companyId)).toBe(false)
    expect(three.some((r) => r.id === expired.companyId)).toBe(false)

    const fourteen = await ids('14')
    expect(fourteen.some((r) => r.id === soon.companyId)).toBe(true)
    expect(fourteen.some((r) => r.id === later.companyId)).toBe(true)

    const exp = await ids('expired')
    expect(exp.some((r) => r.id === expired.companyId)).toBe(true)
    expect(exp.some((r) => r.id === soon.companyId)).toBe(false)

    const bad = await trialsGET(req('GET', undefined, 'http://localhost/api/admin/trials?window=99'))
    expect(bad.status).toBe(400)
  })

  it('numéro WhatsApp ivoirien normalisé', () => {
    expect(toWhatsAppNumber('07 01 02 03 04')).toBe('2250701020304')
    expect(toWhatsAppNumber('+225 07 01 02 03 04')).toBe('2250701020304')
    expect(toWhatsAppNumber('00225 0701020304')).toBe('2250701020304')
    expect(toWhatsAppNumber('12')).toBeNull()
  })
})

describe('Notes internes', () => {
  it('création, épinglage (en premier), suppression réservée à l’auteur', async () => {
    const t = await createTenant('Notes')
    const url = `http://localhost/api/admin/companies/${t.companyId}/notes`

    const empty = await notesPOST(req('POST', { body: '   ' }, url), params(t.companyId))
    expect(empty.status).toBe(400)

    const first = await json(await notesPOST(req('POST', { body: 'Premier appel' }, url), params(t.companyId)))
    expect(first.status).toBe(201)
    const second = await json(await notesPOST(req('POST', { body: 'Démo prévue' }, url), params(t.companyId)))

    const pin = await json(await notesPATCH(req('PATCH', { noteId: first.body.data.id, pinned: true }, url), params(t.companyId)))
    expect(pin.body.data.pinned).toBe(true)

    const list = await json(await notesGET(req('GET', undefined, url), params(t.companyId)))
    expect(list.body.data.map((n: any) => n.id)).toEqual([first.body.data.id, second.body.data.id])

    // Un autre administrateur (support) ne peut pas supprimer la note d'autrui
    const other = await createAdmin('support')
    const saved = { ...admin }
    Object.assign(admin, { adminId: other.id, adminEmail: other.email, role: 'support' })
    const denied = await notesDELETE(req('DELETE', undefined, `${url}?noteId=${first.body.data.id}`), params(t.companyId))
    expect(denied.status).toBe(403)
    Object.assign(admin, saved)

    const ok = await notesDELETE(req('DELETE', undefined, `${url}?noteId=${first.body.data.id}`), params(t.companyId))
    expect(ok.status).toBe(200)
    const after = await json(await notesGET(req('GET', undefined, url), params(t.companyId)))
    expect(after.body.data).toHaveLength(1)

    // La note restante apparaît dans l'historique, avec la création de l'entreprise
    const timeline = await json(await timelineGET(req('GET'), params(t.companyId)))
    expect(timeline.status).toBe(200)
    const kinds = timeline.body.data.map((e: any) => e.kind)
    expect(kinds).toContain('note')
    expect(kinds).toContain('created')
    expect(timeline.body.data[timeline.body.data.length - 1].kind).toBe('created')
  })
})

describe('Recherche globale', () => {
  it('trouve une entreprise par téléphone et une vente par numéro', async () => {
    const t = await createTenant('Recherche')
    const digits = String(Math.floor(10_000_000 + Math.random() * 89_999_999))
    await sql`UPDATE companies SET phone = ${`07 ${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6)}`} WHERE id = ${t.companyId}`
    const sale = await addSale(t, { number: `VTE-${randomUUID().slice(0, 8).toUpperCase()}` })

    const byPhone = await json(await searchGET(req('GET', undefined, `http://localhost/api/admin/search?q=07${digits}`)))
    expect(byPhone.status).toBe(200)
    expect(byPhone.body.data.companies.some((c: any) => c.id === t.companyId)).toBe(true)

    const bySale = await json(await searchGET(req('GET', undefined, `http://localhost/api/admin/search?q=${sale.number.toLowerCase()}`)))
    const found = bySale.body.data.sales.find((s: any) => s.id === sale.id)
    expect(found.company_id).toBe(t.companyId)

    const tooShort = await json(await searchGET(req('GET', undefined, 'http://localhost/api/admin/search?q=a')))
    expect(tooShort.body.data.companies).toEqual([])
  })
})

describe('Fonctionnalités par entreprise', () => {
  it('désactiver le point de vente bloque l’API POS (403)', async () => {
    const t = await createTenant('FlagPos')
    actAs(t)
    expect(isFeatureEnabled({}, 'pos')).toBe(true)

    const enabled = await posGET(req('GET', undefined, 'http://localhost/api/pos'))
    expect(enabled.status).toBe(200)

    const url = `http://localhost/api/admin/companies/${t.companyId}/features`
    const unknown = await featuresPATCH(req('PATCH', { flags: { inconnu: true } }, url), params(t.companyId))
    expect(unknown.status).toBe(400)

    const off = await json(await featuresPATCH(req('PATCH', { flags: { pos: false } }, url), params(t.companyId)))
    expect(off.status).toBe(200)
    expect(off.body.data.effective.pos).toBe(false)

    const blocked = await json(await posGET(req('GET', undefined, 'http://localhost/api/pos')))
    expect(blocked.status).toBe(403)
    expect(blocked.body.error).toBe("Le point de vente n'est pas activé pour votre compte")

    await featuresPATCH(req('PATCH', { flags: { pos: true } }, url), params(t.companyId))
    expect((await posGET(req('GET', undefined, 'http://localhost/api/pos'))).status).toBe(200)
  })
})

describe('Suppression différée et export', () => {
  it('programme, annule, et purge uniquement les suppressions échues', async () => {
    const scheduled = await createTenant('Programmee')
    const due = await createTenant('Echue')
    const { variantId } = await createProduct(due.companyId, due.depotId, { lots: [{ lot: null, qty: 5 }] })
    const sale = await addSale(due)
    await sql`
      INSERT INTO sales_order_items (sales_order_id, product_variant_id, quantity, unit_price, total_price)
      VALUES (${sale.id}, ${variantId}, 2, 500, 1000)
    `

    const res = await json(await companyDELETE(req('DELETE'), params(scheduled.companyId)))
    expect(res.status).toBe(200)
    const [row] = await sql`
      SELECT is_suspended, suspension_reason, deletion_requested_by,
             deletion_scheduled_at > NOW() + INTERVAL '29 days' AS in_30_days
      FROM companies WHERE id = ${scheduled.companyId}
    `
    expect(row).toMatchObject({ is_suspended: true, suspension_reason: 'Suppression programmée', in_30_days: true })
    expect(row.deletion_requested_by).toBe(admin.adminEmail)

    // Déjà programmée → 409
    expect((await companyDELETE(req('DELETE'), params(scheduled.companyId))).status).toBe(409)

    await sql`UPDATE companies SET deletion_scheduled_at = NOW() - INTERVAL '1 day', is_suspended = true WHERE id = ${due.companyId}`

    const result = await purgeScheduledDeletions()
    expect(result.companies.some((c) => c.id === due.companyId)).toBe(true)
    expect(result.companies.some((c) => c.id === scheduled.companyId)).toBe(false)
    expect(await sql`SELECT id FROM companies WHERE id = ${due.companyId}`).toHaveLength(0)
    expect(await sql`SELECT id FROM sales_orders WHERE id = ${sale.id}`).toHaveLength(0)
    expect(await sql`SELECT id FROM companies WHERE id = ${scheduled.companyId}`).toHaveLength(1)

    // Annulation : suspension levée, date effacée
    const restored = await restorePOST(req('POST'), params(scheduled.companyId))
    expect(restored.status).toBe(200)
    const [after] = await sql`SELECT is_suspended, deletion_scheduled_at, suspension_reason FROM companies WHERE id = ${scheduled.companyId}`
    expect(after).toMatchObject({ is_suspended: false, deletion_scheduled_at: null, suspension_reason: null })
    expect((await restorePOST(req('POST'), params(scheduled.companyId))).status).toBe(409)
  })

  it('export JSON en pièce jointe, sans mot de passe', async () => {
    const t = await createTenant('Export')
    const { variantId } = await createProduct(t.companyId, t.depotId, { lots: [{ lot: 'L1', qty: 3 }] })
    const sale = await addSale(t)
    await sql`
      INSERT INTO sales_order_items (sales_order_id, product_variant_id, quantity, unit_price, total_price)
      VALUES (${sale.id}, ${variantId}, 1, 500, 500)
    `

    const res = await exportGET(req('GET'), params(t.companyId))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="export-[a-z0-9-_]+-\d{4}-\d{2}-\d{2}\.json"$/)
    const text = await res.text()
    expect(text).not.toContain('password_hash')
    expect(text).not.toContain('session_version')
    const data = JSON.parse(text)
    expect(data.company.id).toBe(t.companyId)
    expect(data.users).toHaveLength(1)
    expect(data.users[0].email).toContain('@test.local')
    expect(data.products[0].variants).toHaveLength(1)
    expect(data.stock).toHaveLength(1)
    expect(data.sales_orders[0].items).toHaveLength(1)
    expect(data).toHaveProperty('credit_notes')
    expect(data).toHaveProperty('payments')
    expect(data).toHaveProperty('invoices')
  })
})
