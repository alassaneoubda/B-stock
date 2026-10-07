import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'

const depotUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  isMain: z.boolean().optional(),
})

// GET /api/depots/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authz = await requirePermission('stock.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz
    const { id } = await params
    if (!isUuid(id)) throw notFound('Dépôt')

    const depots = await sql`
      SELECT * FROM depots
      WHERE id = ${id} AND company_id = ${companyId}
    `
    if (depots.length === 0) throw notFound('Dépôt')

    return NextResponse.json({ success: true, data: depots[0] })
  } catch (error) {
    return handleRouteError(error, 'depots.detail')
  }
}

// PATCH /api/depots/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authz = await requirePermission('stock.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz
    const { id } = await params
    if (!isUuid(id)) throw notFound('Dépôt')

    const data = depotUpdateSchema.parse(await request.json())

    const depot = await withTransaction(async (tx) => {
      const [existing] = await tx.sql`
        SELECT id FROM depots WHERE id = ${id} AND company_id = ${companyId} FOR UPDATE
      `
      if (!existing) throw notFound('Dépôt')

      // Un seul dépôt principal par entreprise.
      if (data.isMain === true) {
        await tx.sql`
          UPDATE depots SET is_main = false
          WHERE company_id = ${companyId} AND id <> ${id} AND is_main = true
        `
      }

      const [updated] = await tx.sql`
        UPDATE depots SET
          name = COALESCE(${data.name ?? null}, name),
          address = COALESCE(${data.address ?? null}, address),
          phone = COALESCE(${data.phone ?? null}, phone),
          is_main = COALESCE(${data.isMain ?? null}, is_main)
        WHERE id = ${id} AND company_id = ${companyId}
        RETURNING *
      `
      return updated
    })

    return NextResponse.json({ success: true, data: depot })
  } catch (error) {
    return handleRouteError(error, 'depots.update')
  }
}

// DELETE /api/depots/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authz = await requirePermission('stock.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz
    const { id } = await params
    if (!isUuid(id)) throw notFound('Dépôt')

    await withTransaction(async (tx) => {
      const [existing] = await tx.sql<{ id: string; is_main: boolean | null }>`
        SELECT id, is_main FROM depots
        WHERE id = ${id} AND company_id = ${companyId}
        FOR UPDATE
      `
      if (!existing) throw notFound('Dépôt')
      if (existing.is_main) {
        throw new AppError(400, 'Impossible de supprimer le dépôt principal.', 'MAIN_DEPOT')
      }

      // stock / packaging_stock sont supprimés en cascade : on refuse s'il reste de la marchandise.
      const [remaining] = await tx.sql<{ has_stock: boolean }>`
        SELECT EXISTS (SELECT 1 FROM stock WHERE depot_id = ${id} AND quantity > 0)
            OR EXISTS (SELECT 1 FROM packaging_stock WHERE depot_id = ${id} AND quantity > 0) AS has_stock
      `
      if (remaining?.has_stock) {
        throw new AppError(
          400,
          'Impossible de supprimer : ce dépôt contient encore du stock.',
          'DEPOT_NOT_EMPTY'
        )
      }

      try {
        await tx.sql`DELETE FROM depots WHERE id = ${id} AND company_id = ${companyId}`
      } catch (error) {
        if ((error as { code?: string })?.code === '23503') {
          throw new AppError(
            400,
            'Impossible de supprimer : ce dépôt est utilisé (stock, ventes, etc.).',
            'DEPOT_IN_USE'
          )
        }
        throw error
      }
    })

    return NextResponse.json({ success: true, message: 'Dépôt supprimé' })
  } catch (error) {
    return handleRouteError(error, 'depots.delete')
  }
}
