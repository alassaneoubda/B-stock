import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { createSale } from '@/lib/domain/sales'
import { handleRouteError } from '@/lib/errors'

const salesOrderSchema = z.object({
  clientId: z.string().uuid(),
  depotId: z.string().uuid(),
  agentId: z.string().uuid().optional(),
  orderSource: z.string().max(30).optional(),
  paymentMethod: z.enum(['cash', 'mobile_money', 'credit', 'mixed']),
  paidAmount: z.number().min(0).max(1e12).default(0),
  cashAmount: z.number().min(0).max(1e12).optional(),
  notes: z.string().max(2000).optional(),
  items: z
    .array(
      z.object({
        productVariantId: z.string().uuid(),
        quantity: z.number().int().positive().max(1_000_000),
        unitPrice: z.number().min(0).max(1e9),
        lotNumber: z.string().max(100).optional(),
      })
    )
    .min(1, 'Ajoutez au moins un produit')
    .max(200),
  packagingItems: z
    .array(
      z.object({
        packagingTypeId: z.string().uuid(),
        quantityOut: z.number().int().min(0).max(1_000_000).default(0),
        quantityIn: z.number().int().min(0).max(1_000_000).default(0),
        unitPrice: z.number().min(0).max(1e9).default(0),
      })
    )
    .max(100)
    .optional(),
})

// POST /api/sales — Create a new sales order
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('sales.write')
    if (!authz.ok) return authz.response

    const data = salesOrderSchema.parse(await request.json())

    const { order, warnings } = await createSale({
      ...data,
      companyId: authz.companyId,
      userId: authz.userId,
    })

    return NextResponse.json(
      { success: true, data: order, warnings, message: 'Vente créée avec succès' },
      { status: 201 }
    )
  } catch (error) {
    return handleRouteError(error, 'sales.create')
  }
}

const listSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']).optional(),
  clientId: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

// GET /api/sales — List sales orders
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('sales.read')
    if (!authz.ok) return authz.response

    const params = Object.fromEntries(
      [...new URL(request.url).searchParams.entries()].filter(([, v]) => v !== '')
    )
    const { status, clientId, q, limit, offset } = listSchema.parse(params)
    const search = q ? `%${q}%` : null

    const orders = await sql`
      SELECT so.*, c.name as client_name
      FROM sales_orders so
      LEFT JOIN clients c ON so.client_id = c.id
      WHERE so.company_id = ${authz.companyId}
        AND (${status ?? null}::text IS NULL OR so.status = ${status ?? null})
        AND (${clientId ?? null}::uuid IS NULL OR so.client_id = ${clientId ?? null})
        AND (${search}::text IS NULL OR so.order_number ILIKE ${search} OR c.name ILIKE ${search})
      ORDER BY so.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    return NextResponse.json({ success: true, data: orders })
  } catch (error) {
    return handleRouteError(error, 'sales.list')
  }
}
