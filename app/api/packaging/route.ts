import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { z } from 'zod'

const packagingSchema = z.object({
    name: z.string().min(1, 'Le nom est requis'),
    unitsPerCase: z.number().int().min(1).default(1),
    isReturnable: z.boolean().default(true),
    depositPrice: z.number().min(0).default(0),
})

export async function GET() {
    try {
        const authz = await requirePermission('packaging.read')
        if (!authz.ok) return authz.response
        const { session } = authz

        const packagingTypes = await sql`
      SELECT * FROM packaging_types 
      WHERE company_id = ${session.user.companyId}
      ORDER BY name ASC
    `

        return NextResponse.json({ success: true, data: packagingTypes })
    } catch (error) {
        console.error('Error fetching packaging types:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const authz = await requirePermission('packaging.write')
        if (!authz.ok) return authz.response
        const { session } = authz

        const body = await request.json()
        const data = packagingSchema.parse(body)

        const result = await sql`
      INSERT INTO packaging_types (
        company_id, name, units_per_case, is_returnable, deposit_price
      ) VALUES (
        ${session.user.companyId},
        ${data.name},
        ${data.unitsPerCase},
        ${data.isReturnable},
        ${data.depositPrice}
      )
      RETURNING *
    `

        return NextResponse.json({ packagingType: result[0] }, { status: 201 })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error creating packaging type:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
