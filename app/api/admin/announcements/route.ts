import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { badRequest, handleRouteError } from '@/lib/errors'

const schema = z.object({
  title: z.string().trim().min(2),
  body: z.string().trim().min(2),
  level: z.enum(['info', 'success', 'warning', 'critical']).default('info'),
  audience: z.enum(['all', 'company', 'status', 'plan']).default('all'),
  target_company_id: z.string().uuid().optional().nullable(),
  target_status: z.enum(['trialing', 'active', 'past_due', 'canceled']).optional().nullable(),
  target_plan_id: z.string().uuid().optional().nullable(),
  dismissible: z.boolean().optional().default(true),
  is_active: z.boolean().optional().default(true),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
})

// GET /api/admin/announcements — annonces + statistiques (vues, fermetures, portée)
export async function GET() {
  const authz = await requireAdmin('announcements.manage')
  if (!authz.ok) return authz.response

  try {
    const rows = await sql`
      SELECT a.*, c.name AS company_name,
        COALESCE(p.display_name, p.name) AS plan_name,
        (SELECT COUNT(*)::int FROM announcement_dismissals d WHERE d.announcement_id = a.id) AS dismissals,
        (SELECT COUNT(*)::int FROM announcement_views v WHERE v.announcement_id = a.id) AS views,
        -- Utilisateurs actuellement ciblés (dénominateur de la portée)
        (SELECT COUNT(*)::int
           FROM users u
           JOIN companies tc ON tc.id = u.company_id
          WHERE COALESCE(u.is_active, true)
            AND (
              a.audience = 'all'
              OR (a.audience = 'company' AND tc.id = a.target_company_id)
              OR (a.audience = 'status' AND tc.subscription_status = a.target_status)
              OR (a.audience = 'plan' AND a.target_plan_id IS NOT NULL AND (
                    tc.subscription_plan_id = a.target_plan_id
                    OR (tc.subscription_plan_id IS NULL AND tc.subscription_plan_name = p.name)
                  ))
            )
        ) AS target_users
      FROM announcements a
      LEFT JOIN companies c ON a.target_company_id = c.id
      LEFT JOIN subscription_plans p ON a.target_plan_id = p.id
      ORDER BY a.created_at DESC
    `
    return NextResponse.json({ success: true, data: rows })
  } catch (e) {
    return handleRouteError(e, 'admin/announcements GET')
  }
}

// POST /api/admin/announcements — création
export async function POST(request: NextRequest) {
  const authz = await requireAdmin('announcements.manage')
  if (!authz.ok) return authz.response

  try {
    const d = schema.parse(await request.json())

    if (d.audience === 'company' && !d.target_company_id) throw badRequest('Entreprise cible requise')
    if (d.audience === 'status' && !d.target_status) throw badRequest('Statut cible requis')
    if (d.audience === 'plan' && !d.target_plan_id) throw badRequest('Plan cible requis')
    if (d.starts_at && d.ends_at && new Date(d.ends_at) <= new Date(d.starts_at)) {
      throw badRequest('La date de fin doit être postérieure à la date de début')
    }

    const [a] = await sql`
      INSERT INTO announcements
        (title, body, level, audience, target_company_id, target_status, target_plan_id,
         dismissible, is_active, starts_at, ends_at, created_by, created_by_email)
      VALUES (
        ${d.title}, ${d.body}, ${d.level}, ${d.audience},
        ${d.audience === 'company' ? d.target_company_id : null},
        ${d.audience === 'status' ? d.target_status : null},
        ${d.audience === 'plan' ? d.target_plan_id : null},
        ${d.dismissible}, ${d.is_active},
        ${d.starts_at || null}, ${d.ends_at || null},
        ${authz.adminId}, ${authz.adminEmail}
      )
      RETURNING *
    `
    await logAdminAction(authz.adminId, authz.adminEmail, 'announcement.create', 'announcement', a.id, {
      title: d.title,
      audience: d.audience,
    })
    return NextResponse.json({ success: true, data: a })
  } catch (e) {
    return handleRouteError(e, 'admin/announcements POST')
  }
}
