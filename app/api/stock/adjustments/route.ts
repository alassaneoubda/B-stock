import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { withTransaction } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'
import { addStock, removeStock } from '@/lib/domain/stock'

/**
 * Ajustement RELATIF : `quantity` est l'écart à appliquer (positif = entrée,
 * négatif = sortie), pas une quantité absolue.
 */
const adjustmentSchema = z.object({
  depotId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantity: z
    .number()
    .int()
    .refine((v) => v !== 0, { message: 'La quantité ne peut pas être nulle' }),
  reason: z.enum(['adjustment', 'damage', 'return', 'transfer']),
  notes: z.string().max(1000).optional(),
  lotNumber: z.string().trim().max(100).optional(),
})

// POST /api/stock/adjustments — Create a stock adjustment
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('stock.adjust')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const data = adjustmentSchema.parse(await request.json())
    const lotNumber = data.lotNumber || null

    await withTransaction(async (tx) => {
      await assertOwned(tx.sql, companyId, {
        depots: [data.depotId],
        variants: [data.productVariantId],
      })

      const ctx = {
        companyId,
        depotId: data.depotId,
        variantId: data.productVariantId,
        movementType: data.reason,
        referenceType: 'adjustment',
        userId,
        notes: data.notes || null,
        lotNumber,
      }

      if (data.quantity > 0) {
        await addStock(tx, { ...ctx, quantity: data.quantity })
      } else {
        await removeStock(tx, { ...ctx, quantity: -data.quantity })
      }
    })

    return NextResponse.json(
      { success: true, message: 'Ajustement de stock enregistré' },
      { status: 201 }
    )
  } catch (error) {
    return handleRouteError(error, 'stock.adjustments.create')
  }
}
