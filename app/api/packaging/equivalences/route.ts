import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

const equivalenceSchema = z.object({
    packagingTypeA: z.string().uuid(),
    packagingTypeB: z.string().uuid(),
})

// GET /api/packaging/equivalences — List all equivalences
export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const equivalences = await sql`
            SELECT pe.id, pe.packaging_type_a, pe.packaging_type_b, pe.created_at,
                   pta.name as name_a, pta.units_per_case as units_a,
                   ptb.name as name_b, ptb.units_per_case as units_b
            FROM packaging_equivalences pe
            JOIN packaging_types pta ON pe.packaging_type_a = pta.id
            JOIN packaging_types ptb ON pe.packaging_type_b = ptb.id
            WHERE pe.company_id = ${session.user.companyId}
            ORDER BY pta.name, ptb.name
        `

        return NextResponse.json({ success: true, data: equivalences })
    } catch (error) {
        console.error('Error fetching equivalences:', error)
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des équivalences' },
            { status: 500 }
        )
    }
}

// POST /api/packaging/equivalences — Create a new equivalence
export async function POST(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const body = await request.json()
        const data = equivalenceSchema.parse(body)
        const { companyId } = session.user

        if (data.packagingTypeA === data.packagingTypeB) {
            return NextResponse.json(
                { error: 'Les deux emballages doivent être différents' },
                { status: 400 }
            )
        }

        // Verify both packaging types belong to this company
        const types = await sql`
            SELECT id FROM packaging_types
            WHERE id IN (${data.packagingTypeA}, ${data.packagingTypeB})
              AND company_id = ${companyId}
        `
        if (types.length < 2) {
            return NextResponse.json(
                { error: 'Un ou les deux emballages sont introuvables' },
                { status: 404 }
            )
        }

        // Check for existing equivalence (in either direction)
        const existing = await sql`
            SELECT id FROM packaging_equivalences
            WHERE company_id = ${companyId}
              AND (
                (packaging_type_a = ${data.packagingTypeA} AND packaging_type_b = ${data.packagingTypeB})
                OR (packaging_type_a = ${data.packagingTypeB} AND packaging_type_b = ${data.packagingTypeA})
              )
        `
        if (existing.length > 0) {
            return NextResponse.json(
                { error: 'Cette équivalence existe déjà' },
                { status: 409 }
            )
        }

        const result = await sql`
            INSERT INTO packaging_equivalences (packaging_type_a, packaging_type_b, company_id)
            VALUES (${data.packagingTypeA}, ${data.packagingTypeB}, ${companyId})
            RETURNING *
        `

        return NextResponse.json({
            success: true,
            data: result[0],
            message: 'Équivalence créée avec succès',
        }, { status: 201 })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.errors },
                { status: 400 }
            )
        }
        console.error('Error creating equivalence:', error)
        return NextResponse.json(
            { error: 'Erreur lors de la création de l\'équivalence' },
            { status: 500 }
        )
    }
}

// DELETE /api/packaging/equivalences — Delete an equivalence
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const equivalenceId = searchParams.get('id')

        if (!equivalenceId) {
            return NextResponse.json({ error: 'ID requis' }, { status: 400 })
        }

        const result = await sql`
            DELETE FROM packaging_equivalences
            WHERE id = ${equivalenceId} AND company_id = ${session.user.companyId}
            RETURNING id
        `

        if (result.length === 0) {
            return NextResponse.json({ error: 'Équivalence introuvable' }, { status: 404 })
        }

        return NextResponse.json({
            success: true,
            message: 'Équivalence supprimée',
        })
    } catch (error) {
        console.error('Error deleting equivalence:', error)
        return NextResponse.json(
            { error: 'Erreur lors de la suppression' },
            { status: 500 }
        )
    }
}
