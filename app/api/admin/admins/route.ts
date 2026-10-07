import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'

const ADMIN_ROLES = ['super_admin', 'support', 'finance'] as const

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse email invalide').max(255),
  full_name: z.string().trim().min(2, 'Nom requis').max(255),
  role: z.enum(ADMIN_ROLES, { errorMap: () => ({ message: 'Rôle invalide' }) }),
})

/** Mot de passe temporaire robuste (sans caractères ambigus), conforme à la politique. */
function generateTempPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(14)
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  // Garantit au moins une lettre et un chiffre
  return `${out}${2 + (randomBytes(1)[0] % 8)}x`
}

// GET /api/admin/admins — liste des administrateurs de la plateforme
export async function GET() {
  const authz = await requireAdmin('admins.manage')
  if (!authz.ok) return authz.response

  try {
    const admins = await sql`
      SELECT id, email, full_name, role, is_active, totp_enabled, last_login_at, created_at
      FROM platform_admins
      ORDER BY is_active DESC, created_at ASC
    `
    return NextResponse.json({ success: true, data: admins, currentAdminId: authz.adminId })
  } catch (e) {
    return handleRouteError(e, 'admin.admins.list')
  }
}

// POST /api/admin/admins — crée un administrateur ; le mot de passe temporaire n'est renvoyé qu'une fois
export async function POST(request: NextRequest) {
  const authz = await requireAdmin('admins.manage')
  if (!authz.ok) return authz.response

  try {
    const parsed = createSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? 'Données invalides', 'VALIDATION_ERROR')
    }
    const { email, full_name, role } = parsed.data

    const [existingAdmin] = await sql`SELECT 1 FROM platform_admins WHERE lower(email) = ${email} LIMIT 1`
    if (existingAdmin) throw new AppError(409, 'Un administrateur utilise déjà cet email', 'EMAIL_TAKEN')
    // Un email d'administrateur masquerait le compte entreprise à la connexion
    const [existingUser] = await sql`SELECT 1 FROM users WHERE lower(email) = ${email} LIMIT 1`
    if (existingUser) {
      throw new AppError(409, 'Cet email appartient déjà à un utilisateur d’entreprise', 'EMAIL_TAKEN')
    }

    const tempPassword = generateTempPassword()
    const passwordHash = await hash(tempPassword, 12)

    const [created] = await sql`
      INSERT INTO platform_admins (email, full_name, password_hash, role, is_active)
      VALUES (${email}, ${full_name}, ${passwordHash}, ${role}, true)
      RETURNING id, email, full_name, role, is_active, totp_enabled, last_login_at, created_at
    `
    await logAdminAction(authz.adminId, authz.adminEmail, 'admin.create', 'admin', created.id, { email, role })

    return NextResponse.json({ success: true, data: created, tempPassword }, { status: 201 })
  } catch (e) {
    return handleRouteError(e, 'admin.admins.create')
  }
}
