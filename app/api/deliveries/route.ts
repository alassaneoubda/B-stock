import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { z } from 'zod'

const deliveryTourSchema = z.object({
    tourDate: z.string().min(1, 'La date est requise'),
    driverName: z.string().min(1, 'Le nom du chauffeur est requis'),
    vehicleId: z.string().uuid().optional().nullable(),
    depotId: z.string().uuid().optional().nullable(),
    notes: z.string().optional(),
})

// GET /api/deliveries — List delivery tours
export async function GET(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const tours = await sql`
            SELECT
            dt.*,
            v.plate_number as vehicle_plate,
            d.name as depot_name,
            u.full_name as created_by_name
            FROM delivery_tours dt
            LEFT JOIN vehicles v ON dt.vehicle_id = v.id
            LEFT JOIN depots d ON dt.depot_id = d.id
            LEFT JOIN users u ON dt.created_by = u.id
            WHERE dt.company_id = ${session.user.companyId}
            ORDER BY dt.tour_date DESC, dt.created_at DESC
        `

        return NextResponse.json({ success: true, data: tours })
    } catch (error) {
        console.error('Error fetching delivery tours:', error)
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des tournées' },
            { status: 500 }
        )
    }
}

// POST /api/deliveries — Create a new delivery tour
export async function POST(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const body = await request.json()
        const data = deliveryTourSchema.parse(body)

        const result = await sql`
            INSERT INTO delivery_tours (
                company_id, vehicle_id, depot_id, tour_date,
                driver_name, notes, created_by
            ) VALUES (
                ${session.user.companyId},
                ${data.vehicleId || null},
                ${data.depotId || null},
                ${data.tourDate},
                ${data.driverName},
                ${data.notes || null},
                ${session.user.id}
            )
            RETURNING *
        `

        return NextResponse.json({
            success: true,
            data: result[0],
            message: 'Tournée de livraison créée avec succès'
        }, { status: 201 })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error creating delivery tour:', error)
        return NextResponse.json(
            { error: 'Erreur lors de la création de la tournée' },
            { status: 500 }
        )
    }
}
