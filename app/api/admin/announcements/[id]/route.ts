import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { badRequest, handleRouteError, notFound } from '@/lib/errors'

const patchSchema = z.object({
  title: z.string().trim().min(2).optional(),
  body: z.string().trim().min(2).optional(),
  level: z.enum(['info', 'success', 'warning', 'critical']).optional(),
  dismissible: z.boolean().optional(),
  is_active: z.boolean().optional(),
  // undefined = inchangé ; null = effacer la date (diffusion sans début / sans fin)
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
})

// PATCH /api/admin/announcements/:id
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireAdmin('announcements.manage')
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const d = patchSchema.parse(await request.json())

    const [existing] = await sql`SELECT id, starts_at, ends_at FROM announcements WHERE id = ${id}`
    if (!existing) throw notFound('Annonce')

    const setStart = d.starts_at !== undefined
    const setEnd = d.ends_at !== undefined
    const start = setStart ? d.starts_at || null : existing.starts_at
    const end = setEnd ? d.ends_at || null : existing.ends_at
    if (start && end && new Date(end) <= new Date(start)) {
      throw badRequest('La date de fin doit être postérieure à la date de début')
    }

    const [a] = await sql`
      UPDATE announcements SET
        title = COALESCE(${d.title ?? null}, title),
        body = COALESCE(${d.body ?? null}, body),
        level = COALESCE(${d.level ?? null}, level),
        dismissible = COALESCE(${d.dismissible ?? null}, dismissible),
        is_active = COALESCE(${d.is_active ?? null}, is_active),
        starts_at = CASE WHEN ${setStart}::boolean THEN ${setStart ? d.starts_at || null : null}::timestamp ELSE starts_at END,
        ends_at = CASE WHEN ${setEnd}::boolean THEN ${setEnd ? d.ends_at || null : null}::timestamp ELSE ends_at END,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    await logAdminAction(authz.adminId, authz.adminEmail, 'announcement.update', 'announcement', id)
    return NextResponse.json({ success: true, data: a })
  } catch (e) {
    return handleRouteError(e, 'admin/announcements PATCH')
  }
}

// DELETE /api/admin/announcements/:id
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireAdmin('announcements.manage')
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const [existing] = await sql`SELECT id, title FROM announcements WHERE id = ${id}`
    if (!existing) throw notFound('Annonce')
    await sql`DELETE FROM announcements WHERE id = ${id}`
    await logAdminAction(authz.adminId, authz.adminEmail, 'announcement.delete', 'announcement', id, {
      title: existing.title,
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleRouteError(e, 'admin/announcements DELETE')
  }
}
