import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
import { ASSIGNABLE_ROLES, passwordPolicyError, sanitizeModulePermissions } from '@/lib/permissions'

const userSchema = z.object({
  fullName: z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères').max(255),
  email: z.string().trim().toLowerCase().email('Email invalide').max(255),
  password: z.string().max(200),
  role: z.enum(ASSIGNABLE_ROLES),
  phone: z.string().trim().max(20).optional(),
  permissions: z.array(z.string()).optional(),
})

// GET /api/users — List company users
export async function GET() {
  try {
    const authz = await requirePermission('users.read')
    if (!authz.ok) return authz.response

    const users = await sql`
      SELECT id, full_name, email, role, phone, is_active, last_login_at, created_at, permissions
      FROM users
      WHERE company_id = ${authz.companyId}
      ORDER BY created_at
    `

    return NextResponse.json({ success: true, data: users })
  } catch (error) {
    return handleRouteError(error, 'users.list')
  }
}

// POST /api/users — Create a new employee
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('users.write')
    if (!authz.ok) return authz.response

    const data = userSchema.parse(await request.json())

    const policyError = passwordPolicyError(data.password)
    if (policyError) throw new AppError(400, policyError, 'WEAK_PASSWORD')

    // Seul le propriétaire peut nommer un gérant (rôle qui gère l'équipe)
    if (data.role === 'manager' && authz.role !== 'owner') {
      throw new AppError(403, 'Seul le propriétaire peut créer un gérant', 'OWNER_ONLY')
    }

    const existing = await sql`SELECT 1 FROM users WHERE lower(email) = ${data.email} LIMIT 1`
    if (existing.length > 0) {
      throw new AppError(409, 'Cet email est déjà utilisé', 'EMAIL_TAKEN')
    }

    const passwordHash = await hash(data.password, 12)
    const permissions = JSON.stringify(sanitizeModulePermissions(data.permissions))

    const users = await sql`
      INSERT INTO users (company_id, name, full_name, email, password_hash, role, phone, permissions)
      VALUES (
        ${authz.companyId}, ${data.fullName}, ${data.fullName}, ${data.email}, ${passwordHash},
        ${data.role}, ${data.phone || null}, ${permissions}
      )
      RETURNING id, full_name, email, role
    `

    return NextResponse.json({ success: true, data: users[0] }, { status: 201 })
  } catch (error) {
    return handleRouteError(error, 'users.create')
  }
}
