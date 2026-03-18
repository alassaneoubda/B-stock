import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/company — Get current company info
export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const companies = await sql`
      SELECT * FROM companies WHERE id = ${session.user.companyId}
    `

        if (companies.length === 0) {
            return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 })
        }

        return NextResponse.json({ success: true, data: companies[0] })
    } catch (error) {
        console.error('Error fetching company:', error)
        return NextResponse.json({ error: 'Erreur' }, { status: 500 })
    }
}

// PATCH /api/company — Update company info
export async function PATCH(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        // Only owner can update company
        if (session.user.role !== 'owner') {
            return NextResponse.json({ error: 'Accès propriétaire requis' }, { status: 403 })
        }

        const body = await request.json()
        const { name, address, phone, email, sector } = body

        const companies = await sql`
      UPDATE companies SET
        name = COALESCE(${name ?? null}, name),
        address = COALESCE(${address ?? null}, address),
        phone = COALESCE(${phone ?? null}, phone),
        email = COALESCE(${email ?? null}, email),
        sector = COALESCE(${sector ?? null}, sector),
        updated_at = NOW()
      WHERE id = ${session.user.companyId}
      RETURNING *
    `

        return NextResponse.json({ success: true, data: companies[0] })
    } catch (error) {
        console.error('Error updating company:', error)
        return NextResponse.json({ error: 'Erreur' }, { status: 500 })
    }
}
