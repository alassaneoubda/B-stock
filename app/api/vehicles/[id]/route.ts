import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'

/** Le formulaire peut envoyer un nombre, une chaîne vide, null ou rien (= inchangé). */
const capacitySchema = z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v, ctx) => {
        if (v === undefined || v === null || v === '') return undefined
        const n = Number(v)
        if (!Number.isInteger(n) || n < 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Capacité invalide' })
            return z.NEVER
        }
        return n
    })

const vehicleUpdateSchema = z.object({
    name: z.string().max(100).optional(),
    plateNumber: z.string().trim().min(1).max(50).optional(),
    vehicleType: z.enum(['truck', 'tricycle', 'van']).optional(),
    capacityCases: capacitySchema,
    driverName: z.string().max(255).optional(),
    driverPhone: z.string().max(20).optional(),
    isActive: z.boolean().optional(),
})

type Params = { params: Promise<{ id: string }> }

// GET /api/vehicles/[id]
export async function GET(_request: NextRequest, { params }: Params) {
    try {
        const authz = await requirePermission('vehicles.read')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { id } = await params
        if (!isUuid(id)) throw notFound('Véhicule')

        const [vehicle] = await sql`
            SELECT * FROM vehicles WHERE id = ${id} AND company_id = ${companyId}
        `
        if (!vehicle) throw notFound('Véhicule')

        return NextResponse.json({ success: true, data: vehicle })
    } catch (error) {
        return handleRouteError(error, 'vehicles.get')
    }
}

// PATCH /api/vehicles/[id]
export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const authz = await requirePermission('vehicles.write')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { id } = await params
        if (!isUuid(id)) throw notFound('Véhicule')
        const data = vehicleUpdateSchema.parse(await request.json())

        const [vehicle] = await sql`
            UPDATE vehicles SET
                name = COALESCE(${data.name ?? null}, name),
                plate_number = COALESCE(${data.plateNumber ?? null}, plate_number),
                vehicle_type = COALESCE(${data.vehicleType ?? null}, vehicle_type),
                capacity_cases = COALESCE(${data.capacityCases ?? null}::int, capacity_cases),
                driver_name = COALESCE(${data.driverName ?? null}, driver_name),
                driver_phone = COALESCE(${data.driverPhone ?? null}, driver_phone),
                is_active = COALESCE(${data.isActive ?? null}::boolean, is_active)
            WHERE id = ${id} AND company_id = ${companyId}
            RETURNING *
        `
        if (!vehicle) throw notFound('Véhicule')

        return NextResponse.json({ success: true, data: vehicle })
    } catch (error) {
        return handleRouteError(error, 'vehicles.update')
    }
}

// DELETE /api/vehicles/[id]
// Suppression définitive si le véhicule n'a jamais servi, sinon désactivation.
export async function DELETE(_request: NextRequest, { params }: Params) {
    try {
        const authz = await requirePermission('vehicles.write')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { id } = await params
        if (!isUuid(id)) throw notFound('Véhicule')

        const softDeleted = await withTransaction(async (tx) => {
            const [current] = await tx.sql`
                SELECT id FROM vehicles WHERE id = ${id} AND company_id = ${companyId} FOR UPDATE
            `
            if (!current) throw notFound('Véhicule')

            await tx.sql`SAVEPOINT vehicle_delete`
            try {
                await tx.sql`DELETE FROM vehicles WHERE id = ${id} AND company_id = ${companyId}`
                await tx.sql`RELEASE SAVEPOINT vehicle_delete`
                return false
            } catch (error) {
                if ((error as { code?: string })?.code !== '23503') throw error
                // FK (tournées liées) -> désactivation au lieu d'une suppression destructive
                await tx.sql`ROLLBACK TO SAVEPOINT vehicle_delete`
                await tx.sql`UPDATE vehicles SET is_active = false WHERE id = ${id} AND company_id = ${companyId}`
                return true
            }
        })

        return NextResponse.json({
            success: true,
            message: softDeleted ? 'Véhicule désactivé (utilisé dans des tournées)' : 'Véhicule supprimé',
        })
    } catch (error) {
        return handleRouteError(error, 'vehicles.delete')
    }
}
