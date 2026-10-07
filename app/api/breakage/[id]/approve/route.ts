import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { withTransaction } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { adjustPackagingStock, removeStock } from '@/lib/domain/stock'

const approveSchema = z.object({
  action: z.enum(['approve', 'reject']),
})

type BreakageRow = {
  id: string
  depot_id: string | null
  record_type: string
  product_variant_id: string | null
  packaging_type_id: string | null
  quantity: number
  reason: string | null
}

// POST /api/breakage/[id]/approve — Approve breakage and deduct stock (or reject it)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('breakage.approve')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const breakageId = (await params).id
    if (!isUuid(breakageId)) throw notFound('Enregistrement')

    const { action } = approveSchema.parse(await request.json())
    const newStatus = action === 'approve' ? 'approved' : 'rejected'

    await withTransaction(async (tx) => {
      // Transition atomique reported → approved/rejected : un seul traitement possible.
      const [record] = await tx.sql<BreakageRow>`
        UPDATE breakage_records
        SET status = ${newStatus}, approved_by = ${userId}, updated_at = NOW()
        WHERE id = ${breakageId} AND company_id = ${companyId} AND status = 'reported'
        RETURNING id, depot_id, record_type, product_variant_id, packaging_type_id, quantity, reason
      `
      if (!record) {
        const [exists] = await tx.sql`
          SELECT 1 FROM breakage_records WHERE id = ${breakageId} AND company_id = ${companyId}
        `
        if (!exists) throw notFound('Enregistrement')
        throw new AppError(409, 'Déjà traité', 'INVALID_STATUS')
      }

      if (action === 'reject') return

      const hasItem = Boolean(record.product_variant_id || record.packaging_type_id)
      if (hasItem && !record.depot_id) {
        throw new AppError(
          409,
          "Impossible d'approuver : aucun dépôt n'est renseigné pour cette déclaration",
          'MISSING_DEPOT'
        )
      }

      const quantity = Number(record.quantity)
      if (record.product_variant_id && record.depot_id) {
        await removeStock(tx, {
          companyId,
          depotId: record.depot_id,
          variantId: record.product_variant_id,
          quantity,
          movementType: 'damage',
          referenceType: 'breakage',
          referenceId: record.id,
          userId,
          notes: record.reason || record.record_type,
          label: 'cette casse/perte',
        })
      }
      if (record.packaging_type_id && record.depot_id) {
        await adjustPackagingStock(tx, {
          depotId: record.depot_id,
          packagingTypeId: record.packaging_type_id,
          delta: -quantity,
          label: 'cette casse/perte',
        })
      }
    })

    return NextResponse.json({
      success: true,
      message: action === 'reject' ? 'Rejeté' : 'Approuvé et stock ajusté',
    })
  } catch (error) {
    return handleRouteError(error, 'breakage.approve')
  }
}
