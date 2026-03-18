import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { sql } from '@/lib/db'

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

    // Create company
    const companies = await sql`
      INSERT INTO companies (name, slug, email, phone, subscription_status, trial_ends_at)
      VALUES (${companyName}, ${slug}, ${email}, ${phone || null}, 'trialing', ${trialEndsAt.toISOString()})
      RETURNING id
    `

    const companyId = companies[0].id

    // Create user (owner role)
    await sql`
      INSERT INTO users (company_id, email, password_hash, full_name, phone, role)
      VALUES (${companyId}, ${email}, ${passwordHash}, ${fullName}, ${phone || null}, 'owner')
    `

    // Create default depot
    await sql`
      INSERT INTO depots (company_id, name, is_main)
      VALUES (${companyId}, 'Depot Principal', true)
    `

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
