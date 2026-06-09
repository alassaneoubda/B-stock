import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'

const vehicleUpdateSchema = z.object({
    name: z.string().optional(),
    plateNumber: z.string().min(1).optional(),
    vehicleType: z.enum(['truck', 'tricycle', 'van']).optional(),
    capacityCases: z.any().transform(v => v === '' || v === null || Number.isNaN(Number(v)) ? undefined : Number(v)).optional(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
    isActive: z.boolean().optional(),
})

// GET /api/vehicles/[id]
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const authz = await requirePermission('vehicles.read')
        if (!authz.ok) return authz.response
        const { session } = authz
        const { id } = await params

        const vehicles = await sql`
      SELECT * FROM vehicles
      WHERE id = ${id} AND company_id = ${session.user.companyId}
    `
        if (vehicles.length === 0) {
            return NextResponse.json({ error: 'Véhicule introuvable' }, { status: 404 })
        }

        return NextResponse.json({ success: true, data: vehicles[0] })
    } catch (error) {
        console.error('Error fetching vehicle:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

// PATCH /api/vehicles/[id]
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const authz = await requirePermission('vehicles.write')
        if (!authz.ok) return authz.response
        const { session } = authz
        const { id } = await params
        const body = await request.json()
        const data = vehicleUpdateSchema.parse(body)

        const existing = await sql`
      SELECT id FROM vehicles
      WHERE id = ${id} AND company_id = ${session.user.companyId}
    `
        if (existing.length === 0) {
            return NextResponse.json({ error: 'Véhicule introuvable' }, { status: 404 })
        }

        const vehicles = await sql`
      UPDATE vehicles SET
        name = COALESCE(${data.name ?? null}, name),
        plate_number = COALESCE(${data.plateNumber ?? null}, plate_number),
        vehicle_type = COALESCE(${data.vehicleType ?? null}, vehicle_type),
        capacity_cases = COALESCE(${data.capacityCases ?? null}, capacity_cases),
        driver_name = COALESCE(${data.driverName ?? null}, driver_name),
        driver_phone = COALESCE(${data.driverPhone ?? null}, driver_phone),
        is_active = COALESCE(${data.isActive ?? null}, is_active)
      WHERE id = ${id}
      RETURNING *
    `

        return NextResponse.json({ success: true, data: vehicles[0] })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error updating vehicle:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

// DELETE /api/vehicles/[id]
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const authz = await requirePermission('vehicles.write')
        if (!authz.ok) return authz.response
        const { session } = authz
        const { id } = await params

        const existing = await sql`
      SELECT id FROM vehicles
      WHERE id = ${id} AND company_id = ${session.user.companyId}
    `
        if (existing.length === 0) {
            return NextResponse.json({ error: 'Véhicule introuvable' }, { status: 404 })
        }

        try {
            await sql`DELETE FROM vehicles WHERE id = ${id}`
        } catch {
            // FK (tournées liées) -> désactivation au lieu d'une suppression destructive
            await sql`UPDATE vehicles SET is_active = false WHERE id = ${id}`
            return NextResponse.json({ success: true, message: 'Véhicule désactivé (utilisé dans des tournées)' })
        }
        return NextResponse.json({ success: true, message: 'Véhicule supprimé' })
    } catch (error) {
        console.error('Error deleting vehicle:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
