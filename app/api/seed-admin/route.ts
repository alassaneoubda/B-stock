import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { sql } from '@/lib/db'

export async function GET() {
    try {
        const email = 'admin@bstock.com'
        const password = 'adminpassword123'
        const companyName = 'B-Stock Demo Corp'
        const fullName = 'Administrateur Démo'

        // Check if user exists
        const existing = await sql`SELECT id FROM users WHERE email = ${email}`
        if (existing.length > 0) {
            return NextResponse.json({ message: 'Admin already exists' })
        }

        const passwordHash = await hash(password, 12)
        const slug = 'demo-corp-' + Math.random().toString(36).substring(7)
        const trialEndsAt = new Date()
        trialEndsAt.setDate(trialEndsAt.getDate() + 365)

        // Create Company
        const companies = await sql`
      INSERT INTO companies (name, slug, email, subscription_status, trial_ends_at)
      VALUES (${companyName}, ${slug}, ${email}, 'active', ${trialEndsAt.toISOString()})
      RETURNING id
    `
        const companyId = companies[0].id

        // Create User
        await sql`
      INSERT INTO users (company_id, email, password_hash, full_name, role)
      VALUES (${companyId}, ${email}, ${passwordHash}, ${fullName}, 'owner')
    `

        // Create Main Depot
        await sql`
      INSERT INTO depots (company_id, name, is_main)
      VALUES (${companyId}, 'Entrepôt Central', true)
    `

        return NextResponse.json({
            message: 'Admin account created successfully',
            email,
            password: 'adminpassword123'
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
