import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'

const patchSchema = z.object({
  title: z.string().min(2).optional(),
  body: z.string().min(2).optional(),
  level: z.enum(['info', 'success', 'warning', 'critical']).optional(),
  dismissible: z.boolean().optional(),
  is_active: z.boolean().optional(),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
})

// PATCH /api/admin/announcements/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const d = patchSchema.parse(await request.json())

    const [existing] = await sql`SELECT id FROM announcements WHERE id = ${id}`
    if (!existing) {
      return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
    }

    const [a] = await sql`
      UPDATE announcements SET
        title = COALESCE(${d.title ?? null}, title),
        body = COALESCE(${d.body ?? null}, body),
        level = COALESCE(${d.level ?? null}, level),
        dismissible = COALESCE(${d.dismissible ?? null}, dismissible),
        is_active = COALESCE(${d.is_active ?? null}, is_active),
        starts_at = COALESCE(${d.starts_at ?? null}, starts_at),
        ends_at = COALESCE(${d.ends_at ?? null}, ends_at),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    await logAdminAction(authz.adminId, authz.adminEmail, 'announcement.update', 'announcement', id)
    return NextResponse.json({ success: true, data: a })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Données invalides', details: e.errors }, { status: 400 })
    }
    console.error('admin announcement patch error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}

// DELETE /api/admin/announcements/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const [existing] = await sql`SELECT id FROM announcements WHERE id = ${id}`
    if (!existing) {
      return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
    }
    await sql`DELETE FROM announcements WHERE id = ${id}`
    await logAdminAction(authz.adminId, authz.adminEmail, 'announcement.delete', 'announcement', id)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('admin announcement delete error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
