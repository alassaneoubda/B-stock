import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { hash } from 'bcryptjs'
import { z } from 'zod'

const userSchema = z.object({
    fullName: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
    email: z.string().email('Email invalide'),
    password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
    role: z.enum(['manager', 'cashier', 'warehouse_keeper']),
    phone: z.string().optional(),
    permissions: z.array(z.string()).optional()
})

// GET /api/users — List company users
export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const users = await sql`
      SELECT id, full_name, email, role, phone, is_active, last_login_at, created_at, permissions
      FROM users
      WHERE company_id = ${session.user.companyId}
      ORDER BY created_at
    `

        return NextResponse.json({ success: true, data: users })
    } catch (error) {
        console.error('Error fetching users:', error)
        return NextResponse.json({ error: 'Erreur' }, { status: 500 })
    }
}

// POST /api/users — Create a new user
export async function POST(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.companyId || (session.user.role !== 'owner' && session.user.role !== 'manager')) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const body = await request.json()
        const data = userSchema.parse(body)

        // Check if email already exists
        const existingUsers = await sql`SELECT id FROM users WHERE email = ${data.email}`
        if (existingUsers.length > 0) {
            return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 400 })
        }

        const passwordHash = await hash(data.password, 12)

        const permissionsJson = JSON.stringify(data.permissions || [])

        const users = await sql`
            INSERT INTO users (
                company_id, full_name, email, password_hash, role, phone, permissions
            ) VALUES (
                ${session.user.companyId}, ${data.fullName}, ${data.email}, ${passwordHash}, ${data.role}, ${data.phone || null}, ${permissionsJson}
            )
            RETURNING id, full_name, email, role
        `

        return NextResponse.json({ success: true, data: users[0] }, { status: 201 })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error creating user:', error)
        return NextResponse.json({ error: "Erreur lors de la création de l'utilisateur" }, { status: 500 })
    }
}
