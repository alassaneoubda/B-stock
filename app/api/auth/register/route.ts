import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { hash } from 'bcryptjs'
import { sql, sqlRaw, transaction } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { companyName, fullName, email, phone, password } = body

    // Validate required fields
    if (!companyName || !fullName || !email || !password) {
      return NextResponse.json(
        { error: 'Tous les champs obligatoires doivent etre remplis' },
        { status: 400 }
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

    // Calculate trial end date (30 days from now)
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + 30)

    // Pre-generate the company id so all rows can be created atomically
    const companyId = randomUUID()

    // Create company + owner user + default depot ATOMICALLY (tout ou rien)
    await transaction([
      sqlRaw`
        INSERT INTO companies (id, name, slug, email, phone, subscription_status, trial_ends_at)
        VALUES (${companyId}, ${companyName}, ${slug}, ${email}, ${phone || null}, 'trialing', ${trialEndsAt.toISOString()})
      `,
      sqlRaw`
        INSERT INTO users (company_id, email, password_hash, full_name, phone, role)
        VALUES (${companyId}, ${email}, ${passwordHash}, ${fullName}, ${phone || null}, 'owner')
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
