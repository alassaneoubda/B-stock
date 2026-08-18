import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { hash } from 'bcryptjs'
import { sql, sqlRaw, transaction } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { ensureCompaniesSchema } from '@/lib/ensure-companies-schema'
import { ensureUsersFullNameColumn } from '@/lib/ensure-users-schema'

export async function POST(request: Request) {
  try {
    await ensureCompaniesSchema()
    await ensureUsersFullNameColumn()

    const body = await request.json()
    const { companyName, fullName, email, phone, password } = body

    // Validate required fields
    if (!companyName || !fullName || !email || !password) {
      return NextResponse.json(
        { error: 'Tous les champs obligatoires doivent etre remplis' },
        { status: 400 }
      )
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 8 caractères' },
        { status: 400 }
      )
    }

    // Respect global platform configuration
    const settings = await getSettings()
    if (!settings.registrations_open) {
      return NextResponse.json(
        { error: 'Les inscriptions sont temporairement fermees' },
        { status: 403 }
      )
    }

    // Check if email already exists
    const existingUsers = await sql`
      SELECT id FROM users WHERE email = ${email}
    `

    if (existingUsers.length > 0) {
      return NextResponse.json(
        { error: 'Cet email est deja utilise' },
        { status: 400 }
      )
    }

    // Create slug from company name
    const slug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      + '-' + Date.now().toString(36)

    // Hash password
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
        VALUES (${companyId}, 'Depot Principal', true)
      `,
    ])

    return NextResponse.json(
      { message: 'Compte cree avec succes' },
      { status: 201 }
    )
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Une erreur est survenue lors de la creation du compte' },
      { status: 500 }
    )
  }
}
