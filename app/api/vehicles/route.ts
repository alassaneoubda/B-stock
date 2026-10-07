import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'

/** Le formulaire peut envoyer un nombre, une chaîne vide ou rien. */
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

const vehicleSchema = z.object({
    name: z.string().max(100).optional(),
    plateNumber: z.string().trim().min(1, "Numéro d'immatriculation requis").max(50),
    vehicleType: z.enum(['truck', 'tricycle', 'van']).default('truck'),
    capacityCases: capacitySchema,
    driverName: z.string().max(255).optional(),
    driverPhone: z.string().max(20).optional(),
})

/** ?limit (défaut 500 : alimente des listes déroulantes, max 500) / ?offset */
function parsePage(searchParams: URLSearchParams, defaultLimit = 500) {
    const limit = Number.parseInt(searchParams.get('limit') ?? '', 10)
    const offset = Number.parseInt(searchParams.get('offset') ?? '', 10)
    return {
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : defaultLimit,
        offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
    }
}

// POST /api/vehicles
export async function POST(request: NextRequest) {
    try {
        const authz = await requirePermission('vehicles.write')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const data = vehicleSchema.parse(await request.json())

        const [vehicle] = await sql`
            INSERT INTO vehicles (
                company_id, name, plate_number, vehicle_type,
                capacity_cases, driver_name, driver_phone
            ) VALUES (
                ${companyId}, ${data.name || null},
                ${data.plateNumber}, ${data.vehicleType},
                ${data.capacityCases ?? null}, ${data.driverName || null},
                ${data.driverPhone || null}
            )
            RETURNING *
        `

        return NextResponse.json({ success: true, data: vehicle }, { status: 201 })
    } catch (error) {
        return handleRouteError(error, 'vehicles.create')
    }
}

// GET /api/vehicles
export async function GET(request: NextRequest) {
    try {
        const authz = await requirePermission('vehicles.read')
        if (!authz.ok) return authz.response
        const { companyId } = authz

        const { limit, offset } = parsePage(new URL(request.url).searchParams)
        const vehicles = await sql`
            SELECT * FROM vehicles
            WHERE company_id = ${companyId} AND is_active = true
            ORDER BY name, id
            LIMIT ${limit} OFFSET ${offset}
        `

        return NextResponse.json({ success: true, data: vehicles })
    } catch (error) {
        return handleRouteError(error, 'vehicles.list')
    }
}
