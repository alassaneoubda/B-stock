import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

const vehicleSchema = z.object({
    name: z.string().optional(),
    plateNumber: z.string().min(1, 'Numéro d\'immatriculation requis'),
    vehicleType: z.enum(['truck', 'tricycle', 'van']).default('truck'),
    capacityCases: z.any().transform(v => v === '' || Number.isNaN(Number(v)) ? undefined : Number(v)).optional(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
})

// POST /api/vehicles
export async function POST(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const body = await request.json()
        const data = vehicleSchema.parse(body)

        const vehicles = await sql`
      INSERT INTO vehicles (
        company_id, name, plate_number, vehicle_type,
        capacity_cases, driver_name, driver_phone
      ) VALUES (
        ${session.user.companyId}, ${data.name || null},
        ${data.plateNumber}, ${data.vehicleType},
        ${data.capacityCases || null}, ${data.driverName || null},
        ${data.driverPhone || null}
      )
      RETURNING *
    `

        return NextResponse.json({ success: true, data: vehicles[0] }, { status: 201 })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error creating vehicle:', error)
        return NextResponse.json({ error: 'Erreur lors de la création du véhicule' }, { status: 500 })
    }
}

// GET /api/vehicles
export async function GET(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const vehicles = await sql`
      SELECT * FROM vehicles
      WHERE company_id = ${session.user.companyId} AND is_active = true
      ORDER BY name
    `

        return NextResponse.json({ success: true, data: vehicles })
    } catch (error) {
        console.error('Error fetching vehicles:', error)
        return NextResponse.json({ error: 'Erreur lors de la récupération des véhicules' }, { status: 500 })
    }
}
