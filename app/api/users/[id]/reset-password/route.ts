import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { randomBytes } from 'crypto'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'

// POST /api/users/[id]/reset-password
// Permet à l'owner/admin de l'entreprise de réinitialiser le mot de passe d'un
// employé. Génère un mot de passe temporaire renvoyé une seule fois (à
// communiquer à l'utilisateur). Scope strictement limité à l'entreprise.
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const authz = await requirePermission('users.write')
        if (!authz.ok) return authz.response
        const { session } = authz
        const { id } = await params

        const [user] = await sql`
            SELECT id, email FROM users
            WHERE id = ${id} AND company_id = ${session.user.companyId}
        `
        if (!user) {
            return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
        }

        const body = await request.json().catch(() => ({}))
        const tempPassword =
            typeof body.password === 'string' && body.password.length >= 8
                ? body.password
                : randomBytes(6).toString('base64url') + 'A1!'

        const passwordHash = await hash(tempPassword, 10)

        await sql`
            UPDATE users
            SET password_hash = ${passwordHash}, auth_provider = 'credentials', updated_at = NOW()
            WHERE id = ${id} AND company_id = ${session.user.companyId}
        `

        return NextResponse.json({ success: true, tempPassword, email: user.email })
    } catch (error) {
        console.error('Error resetting user password:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
