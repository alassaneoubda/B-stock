import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: async () => null }))
vi.mock('@/lib/admin-auth', () => {
  const ok = async () => ({
    ok: true,
    session: { user: { id: 'admin-test', email: 'admin@test.local' } },
    adminId: 'admin-test',
    adminEmail: 'admin@test.local',
    role: 'super_admin',
  })
  return {
    requireAdmin: ok,
    requireSuperAdmin: ok,
    logAdminAction: async () => {},
    adminCan: () => true,
    adminCapabilities: () => '*',
  }
})

import { actAs, json } from './route-helpers'
import { sql } from '@/lib/db'
import { getLandingContent } from '@/lib/cms'
import { createTenant } from './helpers'
import * as health from '@/app/api/admin/health/route'
import * as announcements from '@/app/api/announcements/route'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Santé de la plateforme', () => {
  it('base de données OK et CRON_SECRET manquant signalé', async () => {
    vi.stubEnv('CRON_SECRET', '')
    // Pas d'appel réseau réel vers GeniusPay pendant les tests
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
    await sql`SELECT 1` // connexion chaude : la latence mesurée reflète la base, pas l'ouverture du pool

    const { status, body } = await json(await health.GET())
    expect(status).toBe(200)
    const checks = body.data.checks as { id: string; status: string; value: string }[]
    const db = checks.find((c) => c.id === 'database')!
    expect(db.status).toBe('ok')
    expect(db.value).toMatch(/Connectée/)

    const cron = checks.find((c) => c.id === 'cron_secret')!
    expect(cron.status).toBe('error')
    expect(cron.value).toBe('Manquant')

    expect(checks.find((c) => c.id === 'geniuspay')!.value).toMatch(/joignable/)
    expect(body.data.status).toBe('error')
    expect((body.data.jobs as { job: string }[]).map((j) => j.job)).toEqual([
      'reconcile-payments',
      'subscription-reminders',
      'purge-companies',
    ])
  })
})

describe('CMS — brouillons', () => {
  it('getLandingContent() exclut une FAQ non publiée ; includeDrafts l’inclut', async () => {
    const question = `Question brouillon ${randomUUID()}`
    const [row] = await sql`
      INSERT INTO cms_faq_items (question, answer, sort_order, is_published)
      VALUES (${question}, 'Réponse en cours de rédaction', 999, false)
      RETURNING id
    `
    try {
      const publicContent = await getLandingContent()
      expect(publicContent.faq.some((f) => f.question === question)).toBe(false)

      const preview = await getLandingContent({ includeDrafts: true })
      expect(preview.faq.some((f) => f.question === question)).toBe(true)
    } finally {
      await sql`DELETE FROM cms_faq_items WHERE id = ${row.id}`
    }
  })
})

describe('Annonces — ciblage par plan et vues', () => {
  it('renvoyée uniquement à une entreprise du plan ; une vue par utilisateur', async () => {
    const [plan] = await sql`
      INSERT INTO subscription_plans (name, price_monthly, price_yearly, max_users, max_depots, max_products)
      VALUES (${`plan-test-${randomUUID().slice(0, 8)}`}, 1000, 10000, 5, 1, 100)
      RETURNING id
    `
    const onPlan = await createTenant('Sur le plan')
    const otherPlan = await createTenant('Autre plan')
    await sql`UPDATE companies SET subscription_plan_id = ${plan.id} WHERE id = ${onPlan.companyId}`

    const [ann] = await sql`
      INSERT INTO announcements (title, body, level, audience, target_plan_id)
      VALUES ('Nouveauté du plan', 'Réservé à votre plan', 'info', 'plan', ${plan.id})
      RETURNING id
    `
    try {
      actAs(onPlan)
      const first = await json(await announcements.GET())
      expect(first.status).toBe(200)
      expect((first.body.data as { id: string }[]).some((a) => a.id === ann.id)).toBe(true)
      await announcements.GET() // second chargement du bandeau

      const [views] = await sql`
        SELECT COUNT(*)::int AS n FROM announcement_views
        WHERE announcement_id = ${ann.id} AND user_id = ${onPlan.userId}
      `
      expect(views.n).toBe(1)

      actAs(otherPlan)
      const other = await json(await announcements.GET())
      expect((other.body.data as { id: string }[]).some((a) => a.id === ann.id)).toBe(false)
      const [total] = await sql`SELECT COUNT(*)::int AS n FROM announcement_views WHERE announcement_id = ${ann.id}`
      expect(total.n).toBe(1)
    } finally {
      await sql`DELETE FROM announcements WHERE id = ${ann.id}`
      await sql`UPDATE companies SET subscription_plan_id = NULL WHERE id = ${onPlan.companyId}`
      await sql`DELETE FROM subscription_plans WHERE id = ${plan.id}`
    }
  })
})
