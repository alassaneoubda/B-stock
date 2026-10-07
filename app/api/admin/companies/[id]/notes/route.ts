import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { badRequest, forbidden, handleRouteError, notFound } from '@/lib/errors'

/**
 * Notes internes sur une entreprise (jamais visibles du client).
 * GET liste (épinglées d'abord) · POST création · PATCH épingler/désépingler
 * DELETE ?noteId= : l'auteur supprime sa note ; un super-administrateur peut tout supprimer.
 */

type Ctx = { params: Promise<{ id: string }> }

const createSchema = z.object({ body: z.string().trim().min(1, 'La note est vide').max(5000, 'Note trop longue (5 000 caractères max.)') })
const pinSchema = z.object({ noteId: z.string().uuid(), pinned: z.boolean() })

async function assertCompany(id: string) {
  const [company] = await sql`SELECT id FROM companies WHERE id = ${id}`
  if (!company) throw notFound('Entreprise')
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  const authz = await requireAdmin('companies.notes')
  if (!authz.ok) return authz.response
  try {
    const { id } = await params
    await assertCompany(id)
    const notes = await sql`
      SELECT id, body, pinned, admin_id, admin_email, created_at
      FROM company_notes WHERE company_id = ${id}
      ORDER BY pinned DESC, created_at DESC
    `
    return NextResponse.json({ success: true, data: notes })
  } catch (error) {
    return handleRouteError(error, 'admin.companies.notes.list')
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const authz = await requireAdmin('companies.notes')
  if (!authz.ok) return authz.response
  try {
    const { id } = await params
    const { body } = createSchema.parse(await request.json().catch(() => ({})))
    await assertCompany(id)
    const [note] = await sql`
      INSERT INTO company_notes (company_id, admin_id, admin_email, body)
      VALUES (${id}, ${authz.adminId}, ${authz.adminEmail}, ${body})
      RETURNING id, body, pinned, admin_id, admin_email, created_at
    `
    await logAdminAction(authz.adminId, authz.adminEmail, 'company.note_create', 'company', id, { noteId: note.id })
    return NextResponse.json({ success: true, data: note }, { status: 201 })
  } catch (error) {
    return handleRouteError(error, 'admin.companies.notes.create')
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const authz = await requireAdmin('companies.notes')
  if (!authz.ok) return authz.response
  try {
    const { id } = await params
    const { noteId, pinned } = pinSchema.parse(await request.json().catch(() => ({})))
    const [note] = await sql`
      UPDATE company_notes SET pinned = ${pinned}
      WHERE id = ${noteId} AND company_id = ${id}
      RETURNING id, body, pinned, admin_id, admin_email, created_at
    `
    if (!note) throw notFound('Note')
    await logAdminAction(authz.adminId, authz.adminEmail, pinned ? 'company.note_pin' : 'company.note_unpin', 'company', id, {
      noteId,
    })
    return NextResponse.json({ success: true, data: note })
  } catch (error) {
    return handleRouteError(error, 'admin.companies.notes.pin')
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const authz = await requireAdmin('companies.notes')
  if (!authz.ok) return authz.response
  try {
    const { id } = await params
    const noteId = new URL(request.url).searchParams.get('noteId') || ''
    if (!z.string().uuid().safeParse(noteId).success) throw badRequest('Note invalide')

    const [note] = await sql`SELECT id, admin_id, body FROM company_notes WHERE id = ${noteId} AND company_id = ${id}`
    if (!note) throw notFound('Note')
    if (note.admin_id !== authz.adminId && authz.role !== 'super_admin') {
      throw forbidden('Vous ne pouvez supprimer que vos propres notes')
    }
    await sql`DELETE FROM company_notes WHERE id = ${noteId} AND company_id = ${id}`
    await logAdminAction(authz.adminId, authz.adminEmail, 'company.note_delete', 'company', id, {
      noteId,
      excerpt: String(note.body).slice(0, 120),
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'admin.companies.notes.delete')
  }
}
