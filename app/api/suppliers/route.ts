import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(200),
  type: z.enum(['manufacturer', 'distributor', 'wholesaler']).optional(),
  contactName: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  // Conditions de paiement (jours après réception) ; 0 = comptant
  paymentTermsDays: z.coerce.number().int().min(0).max(365).optional(),
})

const listSchema = z.object({
  // Pagination optionnelle : sans `limit`, tous les fournisseurs sont renvoyés (listes de sélection).
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('suppliers.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const q = listSchema.parse({
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
    })

    const suppliers = await sql`
      SELECT s.*, COUNT(po.id) as orders_count
      FROM suppliers s
      LEFT JOIN purchase_orders po ON po.supplier_id = s.id AND po.company_id = s.company_id
      WHERE s.company_id = ${companyId}
      GROUP BY s.id
      ORDER BY s.name, s.id
      LIMIT ${q.limit ?? null}::int OFFSET ${q.offset}
    `

    return NextResponse.json({ success: true, data: suppliers })
  } catch (error) {
    return handleRouteError(error, 'suppliers.list')
  }
}

export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('suppliers.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const data = supplierSchema.parse(await request.json())

    const suppliers = await sql`
      INSERT INTO suppliers (
        company_id, name, type, contact_name, phone, email, address, notes, payment_terms_days
      ) VALUES (
        ${companyId},
        ${data.name},
        ${data.type || null},
        ${data.contactName || null},
        ${data.phone || null},
        ${data.email || null},
        ${data.address || null},
        ${data.notes || null},
        ${data.paymentTermsDays ?? 0}
      )
      RETURNING *
    `

    return NextResponse.json({ supplier: suppliers[0] }, { status: 201 })
  } catch (error) {
    return handleRouteError(error, 'suppliers.create')
  }
}
