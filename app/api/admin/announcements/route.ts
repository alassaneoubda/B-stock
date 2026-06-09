import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'

const schema = z.object({
  title: z.string().min(2),
  body: z.string().min(2),
  level: z.enum(['info', 'success', 'warning', 'critical']).default('info'),
  audience: z.enum(['all', 'company', 'status']).default('all'),
  target_company_id: z.string().uuid().optional().nullable(),
  target_status: z.enum(['trialing', 'active', 'past_due', 'canceled']).optional().nullable(),
  dismissible: z.boolean().optional().default(true),
  is_active: z.boolean().optional().default(true),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
})

// GET /api/admin/announcements — list all announcements
export async function GET() {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const rows = await sql`
      SELECT a.*, c.name AS company_name,
        (SELECT COUNT(*)::int FROM announcement_dismissals d WHERE d.announcement_id = a.id) AS dismissals
      FROM announcements a
      LEFT JOIN companies c ON a.target_company_id = c.id
      ORDER BY a.created_at DESC
    `
    return NextResponse.json({ success: true, data: rows })
  } catch (e) {
    console.error('admin announcements list error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}

// POST /api/admin/announcements — create
export async function POST(request: NextRequest) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const d = schema.parse(await request.json())

    if (d.audience === 'company' && !d.target_company_id) {
      return NextResponse.json({ error: 'Entreprise cible requise' }, { status: 400 })
    }
    if (d.audience === 'status' && !d.target_status) {
      return NextResponse.json({ error: 'Statut cible requis' }, { status: 400 })
    }

    const [a] = await sql`
      INSERT INTO announcements
        (title, body, level, audience, target_company_id, target_status,
         dismissible, is_active, starts_at, ends_at, created_by, created_by_email)
      VALUES (
        ${d.title}, ${d.body}, ${d.level}, ${d.audience},
        ${d.audience === 'company' ? d.target_company_id : null},
        ${d.audience === 'status' ? d.target_status : null},
        ${d.dismissible}, ${d.is_active},
        ${d.starts_at || null}, ${d.ends_at || null},
        ${authz.adminId}, ${authz.adminEmail}
      )
      RETURNING *
    `
    await logAdminAction(authz.adminId, authz.adminEmail, 'announcement.create', 'announcement', a.id, { title: d.title })
    return NextResponse.json({ success: true, data: a })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Données invalides', details: e.errors }, { status: 400 })
    }
    console.error('admin announcement create error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
