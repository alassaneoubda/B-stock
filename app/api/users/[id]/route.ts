import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { ROLES, sanitizeModulePermissions } from '@/lib/permissions'
import type { UserRole } from '@/lib/types'
import { isUuid } from '@/lib/tenant'

const userUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(255).optional(),
  role: z.enum(ROLES as [UserRole, ...UserRole[]]).optional(),
  permissions: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
})

// GET /api/users/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await requirePermission('users.read')
    if (!authz.ok) return authz.response

    const { id } = await params
    if (!isUuid(id)) throw notFound('Utilisateur')

    const users = await sql`
      SELECT id, email, full_name, role, permissions, is_active, last_login_at
      FROM users
      WHERE id = ${id} AND company_id = ${authz.companyId}
    `
    if (users.length === 0) throw notFound('Utilisateur')

    return NextResponse.json({ success: true, data: users[0] })
  } catch (error) {
    return handleRouteError(error, 'users.get')
  }
}

// PATCH /api/users/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await requirePermission('users.write')
    if (!authz.ok) return authz.response

    const { id } = await params
    if (!isUuid(id)) throw notFound('Utilisateur')
    const input = userUpdateSchema.parse(await request.json())

    const [target] = await sql`
      SELECT id, role, is_active FROM users WHERE id = ${id} AND company_id = ${authz.companyId}
    `
    if (!target) throw notFound('Utilisateur')

    // L'UI renvoie toujours rôle et statut : seules les vraies modifications comptent.
    if (input.role !== undefined && input.role !== target.role && input.role === 'owner') {
      throw new AppError(403, 'Il ne peut y avoir qu’un seul propriétaire', 'OWNER_PROTECTED')
    }
    const data = {
      ...input,
      role: input.role !== undefined && input.role !== target.role ? input.role : undefined,
      isActive: input.isActive !== undefined && input.isActive !== target.is_active ? input.isActive : undefined,
      // Le propriétaire a toujours accès à tout : ses modules ne sont pas modifiables
      permissions: target.role === 'owner' ? undefined : input.permissions,
    }

    const changesAccess =
      data.role !== undefined || data.isActive !== undefined || data.permissions !== undefined
    const isSelf = id === authz.userId
    const actorIsOwner = authz.role === 'owner'

    if ((data.role !== undefined || data.isActive !== undefined) && isSelf) {
      throw new AppError(403, 'Vous ne pouvez pas modifier vos propres accès', 'SELF_ACCESS')
    }
    if (target.role === 'owner') {
      if (!actorIsOwner) {
        throw new AppError(403, 'Seul le propriétaire peut modifier ce compte', 'OWNER_ONLY')
      }
      if (changesAccess) {
        throw new AppError(403, "Le rôle et l'accès du propriétaire ne peuvent pas être modifiés", 'OWNER_PROTECTED')
      }
    }
    if (!actorIsOwner && (target.role === 'manager' || data.role === 'manager')) {
      throw new AppError(403, 'Seul le propriétaire peut gérer les gérants', 'OWNER_ONLY')
    }

    const permissions = data.permissions ? JSON.stringify(sanitizeModulePermissions(data.permissions)) : null

    // Rôle / permissions modifiés : on invalide les sessions pour appliquer
    // immédiatement les nouveaux droits (navigation comprise).
    const bumpSession = data.role !== undefined || data.permissions !== undefined

    const result = await sql`
      UPDATE users
      SET
        full_name = COALESCE(${data.fullName ?? null}, full_name),
        name = COALESCE(${data.fullName ?? null}, name),
        role = COALESCE(${data.role ?? null}, role),
        permissions = COALESCE(${permissions}::jsonb, permissions),
        is_active = COALESCE(${data.isActive ?? null}, is_active),
        session_version = session_version + ${bumpSession ? 1 : 0},
        updated_at = NOW()
      WHERE id = ${id} AND company_id = ${authz.companyId}
      RETURNING id, email, full_name, role, permissions, is_active
    `

    return NextResponse.json({
      success: true,
      data: result[0],
      message: 'Utilisateur mis à jour avec succès',
    })
  } catch (error) {
    return handleRouteError(error, 'users.update')
  }
}
