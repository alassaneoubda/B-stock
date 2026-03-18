import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

const clientUpdateSchema = z.object({
    name: z.string().min(1).optional(),
    contactName: z.string().optional(),
    clientType: z.enum(['retail', 'wholesale', 'restaurant', 'bar', 'subdepot']).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
    gpsCoordinates: z.string().optional(),
    zone: z.string().optional(),
    creditLimit: z.number().min(0).optional(),
    packagingCreditLimit: z.number().min(0).optional(),
    paymentTermsDays: z.number().int().min(0).optional(),
    notes: z.string().optional(),
    isActive: z.boolean().optional(),
})

// GET /api/clients/[id] — Get a single client with full details
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

        const clients = await sql`
      SELECT * FROM clients
      WHERE id = ${id} AND company_id = ${session.user.companyId}
    `

        if (clients.length === 0) {
            return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
        }

        // Get accounts
        const accounts = await sql`
      SELECT * FROM client_accounts WHERE client_id = ${id}
    `

        // Get recent orders
        const recentOrders = await sql`
      SELECT id, order_number, total_amount, paid_amount, status, payment_method, created_at
      FROM sales_orders
      WHERE client_id = ${id}
      ORDER BY created_at DESC
      LIMIT 20
    `

        // Get packaging transactions
        const packagingHistory = await sql`
      SELECT pt.*, pk.name as packaging_name
      FROM packaging_transactions pt
      LEFT JOIN packaging_types pk ON pt.packaging_type_id = pk.id
      WHERE pt.client_id = ${id}
      ORDER BY pt.created_at DESC
      LIMIT 20
    `

        return NextResponse.json({
            success: true,
            data: {
                ...clients[0],
                accounts,
                recentOrders,
                packagingHistory,
            },
        })
    } catch (error) {
        console.error('Error fetching client:', error)
        return NextResponse.json(
            { error: 'Erreur lors de la récupération du client' },
            { status: 500 }
        )
    }
}

// PATCH /api/clients/[id] — Update a client
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const { id } = await params
        const body = await request.json()
        const data = clientUpdateSchema.parse(body)

        // Verify client belongs to company
        const existing = await sql`
      SELECT id FROM clients
      WHERE id = ${id} AND company_id = ${session.user.companyId}
    `
        if (existing.length === 0) {
            return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
        }

        const clients = await sql`
      UPDATE clients SET
        name = COALESCE(${data.name ?? null}, name),
        contact_name = COALESCE(${data.contactName ?? null}, contact_name),
        client_type = COALESCE(${data.clientType ?? null}, client_type),
        phone = COALESCE(${data.phone ?? null}, phone),
        email = COALESCE(${data.email ?? null}, email),
        address = COALESCE(${data.address ?? null}, address),
        gps_coordinates = COALESCE(${data.gpsCoordinates ?? null}, gps_coordinates),
        zone = COALESCE(${data.zone ?? null}, zone),
        credit_limit = COALESCE(${data.creditLimit ?? null}, credit_limit),
        packaging_credit_limit = COALESCE(${data.packagingCreditLimit ?? null}, packaging_credit_limit),
        payment_terms_days = COALESCE(${data.paymentTermsDays ?? null}, payment_terms_days),
        notes = COALESCE(${data.notes ?? null}, notes),
        is_active = COALESCE(${data.isActive ?? null}, is_active),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `

        return NextResponse.json({
            success: true,
            data: clients[0],
            message: 'Client mis à jour avec succès',
        })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.errors },
                { status: 400 }
            )
        }
        console.error('Error updating client:', error)
        return NextResponse.json(
            { error: 'Erreur lors de la mise à jour du client' },
            { status: 500 }
        )
    }
}

// DELETE /api/clients/[id] — Soft delete a client
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const { id } = await params

        // Verify client belongs to company
        const existing = await sql`
      SELECT id FROM clients
      WHERE id = ${id} AND company_id = ${session.user.companyId}
    `
        if (existing.length === 0) {
            return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
        }

        // Check for outstanding balance
        const accounts = await sql`
      SELECT COALESCE(SUM(ABS(balance)), 0) as total_balance
      FROM client_accounts WHERE client_id = ${id}
    `
        const totalBalance = Number(accounts[0]?.total_balance || 0)

        if (totalBalance > 0) {
            return NextResponse.json({
                error: `Impossible de supprimer: le client a un solde en cours de ${totalBalance} FCFA`,
            }, { status: 400 })
        }

        // Soft delete
        await sql`
      UPDATE clients SET is_active = false, updated_at = NOW()
      WHERE id = ${id}
    `

        return NextResponse.json({
            success: true,
            message: 'Client désactivé avec succès',
        })
    } catch (error) {
        console.error('Error deleting client:', error)
        return NextResponse.json(
            { error: 'Erreur lors de la suppression du client' },
            { status: 500 }
        )
    }
}
