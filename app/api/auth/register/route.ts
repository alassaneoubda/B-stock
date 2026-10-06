import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { sql, sqlRaw, transaction } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { ensureCompaniesSchema } from '@/lib/ensure-companies-schema'
import { ensureUsersFullNameColumn } from '@/lib/ensure-users-schema'
import { AppError, handleRouteError } from '@/lib/errors'
import { passwordPolicyError } from '@/lib/permissions'
import { clientIp, rateLimit } from '@/lib/rate-limit'

const registerSchema = z.object({
  companyName: z.string().trim().min(2, "Le nom de l'entreprise est requis").max(255),
  fullName: z.string().trim().min(2, 'Votre nom est requis').max(255),
  email: z.string().trim().toLowerCase().email('Email invalide').max(255),
  phone: z.string().trim().max(20).optional().nullable(),
  password: z.string().max(200),
})

export async function POST(request: Request) {
  try {
    // Anti-abus : 5 inscriptions par heure et par adresse IP
    const limited = await rateLimit('register', clientIp(request.headers), { limit: 5, windowSeconds: 3600 })
    if (limited) return limited

    const parsed = registerSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      const first = parsed.error.errors[0]?.message
      throw new AppError(400, first || 'Tous les champs obligatoires doivent être remplis', 'VALIDATION_ERROR')
    }
    const { companyName, fullName, email, phone, password } = parsed.data

    const policyError = passwordPolicyError(password)
    if (policyError) throw new AppError(400, policyError, 'WEAK_PASSWORD')

    // Respect global platform configuration
    const settings = await getSettings()
    if (!settings.registrations_open) {
      throw new AppError(403, 'Les inscriptions sont temporairement fermées', 'REGISTRATIONS_CLOSED')
    }

    await ensureCompaniesSchema()
    await ensureUsersFullNameColumn()

    const existingUsers = await sql`SELECT 1 FROM users WHERE lower(email) = ${email} LIMIT 1`
    if (existingUsers.length > 0) {
      throw new AppError(409, 'Cet email est déjà utilisé', 'EMAIL_TAKEN')
    }

    const slug =
      companyName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      Date.now().toString(36)

    const passwordHash = await hash(password, 12)

    // Calculate trial end date from global configuration
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + settings.trial_days)

    // Pre-generate the company id so all rows can be created atomically
    const companyId = randomUUID()

    // Create company + owner user + default depot ATOMICALLY (tout ou rien)
    await transaction([
      sqlRaw`
        INSERT INTO companies (id, name, slug, email, phone, subscription_status, trial_ends_at)
        VALUES (${companyId}, ${companyName}, ${slug}, ${email}, ${phone || null}, 'trialing', ${trialEndsAt.toISOString()})
      `,
      sqlRaw`
        INSERT INTO users (company_id, email, password_hash, name, full_name, phone, role)
        VALUES (${companyId}, ${email}, ${passwordHash}, ${fullName}, ${fullName}, ${phone || null}, 'owner')
      `,
      sqlRaw`
        INSERT INTO depots (company_id, name, is_main)
        VALUES (${companyId}, 'Dépôt principal', true)
      `,
    ])

    return NextResponse.json({ message: 'Compte créé avec succès' }, { status: 201 })
  } catch (error) {
    return handleRouteError(error, 'auth.register')
  }
}
