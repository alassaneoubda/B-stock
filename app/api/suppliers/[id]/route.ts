import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'

const supplierUpdateSchema = z.object({
    name: z.string().min(2).optional(),
    type: z.enum(['manufacturer', 'distributor', 'wholesaler']).optional(),
    contactName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
    notes: z.string().optional(),
})

// GET /api/suppliers/[id]
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const authz = await requirePermission('suppliers.read')
        if (!authz.ok) return authz.response
        const { session } = authz
        const { id } = await params

        const suppliers = await sql`
      SELECT * FROM suppliers
      WHERE id = ${id} AND company_id = ${session.user.companyId}
    `
        if (suppliers.length === 0) {
            return NextResponse.json({ error: 'Fournisseur introuvable' }, { status: 404 })
        }

        const recentOrders = await sql`
      SELECT id, order_number, total_amount, status, created_at
      FROM purchase_orders
      WHERE supplier_id = ${id}
      ORDER BY created_at DESC
      LIMIT 20
    `

        return NextResponse.json({
            success: true,
            data: { ...suppliers[0], recentOrders },
        })
    } catch (error) {
        console.error('Error fetching supplier:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

// PATCH /api/suppliers/[id]
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const authz = await requirePermission('suppliers.write')
        if (!authz.ok) return authz.response
        const { session } = authz
        const { id } = await params
        const body = await request.json()
        const data = supplierUpdateSchema.parse(body)

        const existing = await sql`
      SELECT id FROM suppliers
      WHERE id = ${id} AND company_id = ${session.user.companyId}
    `
        if (existing.length === 0) {
            return NextResponse.json({ error: 'Fournisseur introuvable' }, { status: 404 })
        }

        const suppliers = await sql`
      UPDATE suppliers SET
        name = COALESCE(${data.name ?? null}, name),
        type = COALESCE(${data.type ?? null}, type),
        contact_name = COALESCE(${data.contactName ?? null}, contact_name),
        phone = COALESCE(${data.phone ?? null}, phone),
        email = COALESCE(${data.email ?? null}, email),
        address = COALESCE(${data.address ?? null}, address),
        notes = COALESCE(${data.notes ?? null}, notes)
      WHERE id = ${id}
      RETURNING *
    `

        return NextResponse.json({ success: true, data: suppliers[0] })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error updating supplier:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

// DELETE /api/suppliers/[id]
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const authz = await requirePermission('suppliers.write')
        if (!authz.ok) return authz.response
        const { session } = authz
        const { id } = await params

        const existing = await sql`
      SELECT id FROM suppliers
      WHERE id = ${id} AND company_id = ${session.user.companyId}
    `
        if (existing.length === 0) {
            return NextResponse.json({ error: 'Fournisseur introuvable' }, { status: 404 })
        }

        const orders = await sql`
      SELECT COUNT(*)::int as count FROM purchase_orders WHERE supplier_id = ${id}
    `
        if (Number(orders[0]?.count || 0) > 0) {
            return NextResponse.json(
                { error: 'Impossible de supprimer : ce fournisseur a des commandes liées.' },
                { status: 400 },
            )
        }

        await sql`DELETE FROM suppliers WHERE id = ${id}`
        return NextResponse.json({ success: true, message: 'Fournisseur supprimé' })
    } catch (error) {
        console.error('Error deleting supplier:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
