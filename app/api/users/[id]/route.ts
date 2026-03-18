import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { z } from 'zod'

const userUpdateSchema = z.object({
    fullName: z.string().min(2).optional(),
    role: z.string().optional(),
    permissions: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
})

// GET /api/users/[id]
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const { id } = await params

        const users = await sql`
            SELECT id, email, full_name, role, permissions, is_active, last_login_at
            FROM users
            WHERE id = ${id} AND company_id = ${session.user.companyId}
        `

        if (users.length === 0) {
            return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
        }

        return NextResponse.json({ success: true, data: users[0] })
    } catch (error) {
        console.error('Error fetching user:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

// PATCH /api/users/[id]
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.companyId || session.user.role !== 'owner') {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const { id } = await params
        const body = await request.json()
        const data = userUpdateSchema.parse(body)

        const result = await sql`
            UPDATE users
            SET 
                full_name = COALESCE(${data.fullName || null}, full_name),
                role = COALESCE(${data.role || null}, role),
                permissions = COALESCE(${data.permissions ? JSON.stringify(data.permissions) : null}::jsonb, permissions),
                is_active = COALESCE(${data.isActive !== undefined ? data.isActive : null}, is_active),
                updated_at = NOW()
            WHERE id = ${id} AND company_id = ${session.user.companyId}
            RETURNING id, email, full_name, role, permissions, is_active
        `

        if (result.length === 0) {
            return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
        }

        return NextResponse.json({
            success: true,
            data: result[0],
            message: 'Utilisateur mis à jour avec succès'
        })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error updating user:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
