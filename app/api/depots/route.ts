import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { z } from 'zod'

const depotSchema = z.object({
    name: z.string().min(1, 'Le nom est requis'),
    address: z.string().optional(),
    phone: z.string().optional(),
    isMain: z.boolean().default(false),
})

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const depots = await sql`
      SELECT * FROM depots 
      WHERE company_id = ${session.user.companyId}
      ORDER BY is_main DESC, name ASC
    `

        return NextResponse.json({ success: true, data: depots })
    } catch (error) {
        console.error('Error fetching depots:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const body = await request.json()
        const data = depotSchema.parse(body)

        // Si c'est le nouveau dépôt principal, on retire le statut main des autres
        if (data.isMain) {
            await sql`
        UPDATE depots SET is_main = false 
        WHERE company_id = ${session.user.companyId}
      `
        }

        const result = await sql`
      INSERT INTO depots (
        company_id, name, address, phone, is_main
      ) VALUES (
        ${session.user.companyId},
        ${data.name},
        ${data.address || null},
        ${data.phone || null},
        ${data.isMain}
      )
      RETURNING *
    `

        return NextResponse.json({ depot: result[0] }, { status: 201 })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error creating depot:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
