import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { changeSaleStatus, SALE_STATUSES } from '@/lib/domain/sales'
import { handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'

// GET /api/sales/[id] — Get sale order detail
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await requirePermission('sales.read')
    if (!authz.ok) return authz.response

    const { id } = await params
    if (!isUuid(id)) throw notFound('Commande')

    const orders = await sql`
      SELECT so.*, c.name as client_name, c.phone as client_phone,
             c.address as client_address, c.client_type,
             d.name as depot_name, u.full_name as created_by_name
      FROM sales_orders so
      LEFT JOIN clients c ON so.client_id = c.id
      LEFT JOIN depots d ON so.depot_id = d.id
      LEFT JOIN users u ON so.created_by = u.id
      WHERE so.id = ${id} AND so.company_id = ${authz.companyId}
    `
    if (orders.length === 0) throw notFound('Commande')

    const [items, packagingItems, payments] = await Promise.all([
      sql`
        SELECT soi.*, p.name as product_name, p.brand,
               pt.name as packaging_name, pv.barcode
        FROM sales_order_items soi
        JOIN product_variants pv ON soi.product_variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
        WHERE soi.sales_order_id = ${id}
      `,
      sql`
        SELECT sopi.*, pt.name as packaging_name
        FROM sales_order_packaging_items sopi
        JOIN packaging_types pt ON sopi.packaging_type_id = pt.id
        WHERE sopi.sales_order_id = ${id}
      `,
      sql`
        SELECT p.*, u.full_name as received_by_name
        FROM payments p
        LEFT JOIN users u ON p.received_by = u.id
        WHERE p.sales_order_id = ${id} AND p.company_id = ${authz.companyId}
        ORDER BY p.created_at
      `,
    ])

    return NextResponse.json({
      success: true,
      data: { ...orders[0], items, packagingItems, payments },
    })
  } catch (error) {
    return handleRouteError(error, 'sales.get')
  }
}

const statusSchema = z.object({ status: z.enum(SALE_STATUSES) })

// PATCH /api/sales/[id] — Change sale status (l'annulation contre-passe la vente)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isUuid(id)) throw notFound('Commande')
    const { status } = statusSchema.parse(await request.json())

    // Annuler une vente = remettre en stock et effacer la dette : permission dédiée
    const authz = await requirePermission(status === 'cancelled' ? 'sales.cancel' : 'sales.write')
    if (!authz.ok) return authz.response

    const { order, warnings } = await changeSaleStatus({
      companyId: authz.companyId,
      userId: authz.userId,
      orderId: id,
      status,
    })

    return NextResponse.json({
      success: true,
      data: order,
      warnings,
      message: status === 'cancelled' ? 'Vente annulée' : 'Statut mis à jour',
    })
  } catch (error) {
    return handleRouteError(error, 'sales.status')
  }
}
