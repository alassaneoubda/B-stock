import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'

const depotUpdateSchema = z.object({
    name: z.string().min(1).optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    isMain: z.boolean().optional(),
})

// GET /api/depots/[id]
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const authz = await requirePermission('stock.read')
        if (!authz.ok) return authz.response
        const { session } = authz
        const { id } = await params

        const depots = await sql`
      SELECT * FROM depots
      WHERE id = ${id} AND company_id = ${session.user.companyId}
    `
        if (depots.length === 0) {
            return NextResponse.json({ error: 'Dépôt introuvable' }, { status: 404 })
        }

        return NextResponse.json({ success: true, data: depots[0] })
    } catch (error) {
        console.error('Error fetching depot:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

// PATCH /api/depots/[id]
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const authz = await requirePermission('stock.write')
        if (!authz.ok) return authz.response
        const { session } = authz
        const { id } = await params
        const body = await request.json()
        const data = depotUpdateSchema.parse(body)

        const existing = await sql`
      SELECT id FROM depots
      WHERE id = ${id} AND company_id = ${session.user.companyId}
    `
        if (existing.length === 0) {
            return NextResponse.json({ error: 'Dépôt introuvable' }, { status: 404 })
        }

        // Un seul dépôt principal par entreprise.
        if (data.isMain === true) {
            await sql`
        UPDATE depots SET is_main = false
        WHERE company_id = ${session.user.companyId} AND id <> ${id}
      `
        }

        const depots = await sql`
      UPDATE depots SET
        name = COALESCE(${data.name ?? null}, name),
        address = COALESCE(${data.address ?? null}, address),
        phone = COALESCE(${data.phone ?? null}, phone),
        is_main = COALESCE(${data.isMain ?? null}, is_main)
      WHERE id = ${id}
      RETURNING *
    `

        return NextResponse.json({ success: true, data: depots[0] })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error updating depot:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

// DELETE /api/depots/[id]
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const authz = await requirePermission('stock.write')
        if (!authz.ok) return authz.response
        const { session } = authz
        const { id } = await params

        const existing = await sql`
      SELECT id, is_main FROM depots
      WHERE id = ${id} AND company_id = ${session.user.companyId}
    `
        if (existing.length === 0) {
            return NextResponse.json({ error: 'Dépôt introuvable' }, { status: 404 })
        }
        if (existing[0].is_main) {
            return NextResponse.json(
                { error: 'Impossible de supprimer le dépôt principal.' },
                { status: 400 },
            )
        }

        try {
            await sql`DELETE FROM depots WHERE id = ${id}`
        } catch {
            return NextResponse.json(
                { error: 'Impossible de supprimer : ce dépôt est utilisé (stock, ventes, etc.).' },
                { status: 400 },
            )
        }
        return NextResponse.json({ success: true, message: 'Dépôt supprimé' })
    } catch (error) {
        console.error('Error deleting depot:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
