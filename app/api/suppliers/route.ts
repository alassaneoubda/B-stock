import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { z } from 'zod'

const supplierSchema = z.object({
    name: z.string().min(2),
    type: z.enum(['manufacturer', 'distributor', 'wholesaler']).optional(),
    contactName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
    notes: z.string().optional(),
})

export async function GET() {
    try {
        const authz = await requirePermission('suppliers.read')
        if (!authz.ok) return authz.response
        const { session } = authz

        const suppliers = await sql`
      SELECT s.*, COUNT(po.id) as orders_count
      FROM suppliers s
      LEFT JOIN purchase_orders po ON po.supplier_id = s.id
      WHERE s.company_id = ${session.user.companyId}
      GROUP BY s.id
      ORDER BY s.name
    `

        return NextResponse.json({ success: true, data: suppliers })
    } catch (error) {
        console.error('Error fetching suppliers:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const authz = await requirePermission('suppliers.write')
        if (!authz.ok) return authz.response
        const { session } = authz

        const body = await request.json()
        const data = supplierSchema.parse(body)

        const suppliers = await sql`
      INSERT INTO suppliers (
        company_id, name, type, contact_name, phone, email, address, notes
      ) VALUES (
        ${session.user.companyId},
        ${data.name},
        ${data.type || null},
        ${data.contactName || null},
        ${data.phone || null},
        ${data.email || null},
        ${data.address || null},
        ${data.notes || null}
      )
      RETURNING *
    `

        return NextResponse.json({ supplier: suppliers[0] }, { status: 201 })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.errors }, { status: 400 })
        }
        console.error('Error creating supplier:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
