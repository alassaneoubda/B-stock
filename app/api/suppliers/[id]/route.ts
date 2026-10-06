import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'

const supplierUpdateSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  type: z.enum(['manufacturer', 'distributor', 'wholesaler']).optional(),
  contactName: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
})

// GET /api/suppliers/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authz = await requirePermission('suppliers.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz
    const { id } = await params
    if (!isUuid(id)) throw notFound('Fournisseur')

    const suppliers = await sql`
      SELECT * FROM suppliers
      WHERE id = ${id} AND company_id = ${companyId}
    `
    if (suppliers.length === 0) throw notFound('Fournisseur')

    const recentOrders = await sql`
      SELECT id, order_number, total_amount, status, created_at
      FROM purchase_orders
      WHERE supplier_id = ${id} AND company_id = ${companyId}
      ORDER BY created_at DESC
      LIMIT 20
    `

    return NextResponse.json({
      success: true,
      data: { ...suppliers[0], recentOrders },
    })
  } catch (error) {
    return handleRouteError(error, 'suppliers.detail')
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
    const { companyId } = authz
    const { id } = await params
    if (!isUuid(id)) throw notFound('Fournisseur')

    const data = supplierUpdateSchema.parse(await request.json())

    const suppliers = await sql`
      UPDATE suppliers SET
        name = COALESCE(${data.name ?? null}, name),
        type = COALESCE(${data.type ?? null}, type),
        contact_name = COALESCE(${data.contactName ?? null}, contact_name),
        phone = COALESCE(${data.phone ?? null}, phone),
        email = COALESCE(${data.email ?? null}, email),
        address = COALESCE(${data.address ?? null}, address),
        notes = COALESCE(${data.notes ?? null}, notes)
      WHERE id = ${id} AND company_id = ${companyId}
      RETURNING *
    `
    if (suppliers.length === 0) throw notFound('Fournisseur')

    return NextResponse.json({ success: true, data: suppliers[0] })
  } catch (error) {
    return handleRouteError(error, 'suppliers.update')
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
    const { companyId } = authz
    const { id } = await params
    if (!isUuid(id)) throw notFound('Fournisseur')

    await withTransaction(async (tx) => {
      const [existing] = await tx.sql`
        SELECT id FROM suppliers WHERE id = ${id} AND company_id = ${companyId} FOR UPDATE
      `
      if (!existing) throw notFound('Fournisseur')

      const [orders] = await tx.sql<{ count: number }>`
        SELECT COUNT(*)::int as count FROM purchase_orders WHERE supplier_id = ${id}
      `
      if (Number(orders?.count || 0) > 0) {
        throw new AppError(
          400,
          'Impossible de supprimer : ce fournisseur a des commandes liées.',
          'SUPPLIER_IN_USE'
        )
      }

      try {
        await tx.sql`DELETE FROM suppliers WHERE id = ${id} AND company_id = ${companyId}`
      } catch (error) {
        if ((error as { code?: string })?.code === '23503') {
          throw new AppError(
            400,
            'Impossible de supprimer : ce fournisseur est référencé ailleurs (factures, produits…).',
            'SUPPLIER_IN_USE'
          )
        }
        throw error
      }
    })

    return NextResponse.json({ success: true, message: 'Fournisseur supprimé' })
  } catch (error) {
    return handleRouteError(error, 'suppliers.delete')
  }
}
