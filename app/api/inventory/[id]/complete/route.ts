import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { withTransaction } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { addStock, removeStock, setPackagingStockLevel } from '@/lib/domain/stock'

const completeSchema = z.object({
  apply_adjustments: z.boolean().optional().default(false),
  notes: z.string().trim().max(2000).nullish(),
})

type CountedItem = {
  id: string
  item_type: string | null
  product_variant_id: string | null
  packaging_type_id: string | null
  system_quantity: number
  counted_quantity: number
  unit_value: string | null
}

// POST /api/inventory/[id]/complete — Finalize inventory and apply adjustments
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('inventory.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const inventoryId = (await params).id
    if (!isUuid(inventoryId)) throw notFound('Inventaire')

    const rawBody = await request.json().catch(() => ({}))
    const { apply_adjustments: applyAdjustments, notes } = completeSchema.parse(rawBody ?? {})

    const result = await withTransaction(async (tx) => {
      // Bascule atomique in_progress → completed : une seule finalisation possible.
      const [inv] = await tx.sql<{ id: string; depot_id: string; session_number: string | null }>`
        UPDATE inventory_sessions SET
          status = 'completed',
          completed_by = ${userId},
          completed_at = NOW(),
          notes = COALESCE(${notes || null}, notes)
        WHERE id = ${inventoryId} AND company_id = ${companyId} AND status = 'in_progress'
        RETURNING id, depot_id, session_number
      `
      if (!inv) {
        const [exists] = await tx.sql`
          SELECT 1 FROM inventory_sessions WHERE id = ${inventoryId} AND company_id = ${companyId}
        `
        if (!exists) throw notFound('Inventaire')
        throw new AppError(409, 'Inventaire déjà finalisé', 'INVALID_STATUS')
      }

      const items = await tx.sql<CountedItem>`
        SELECT id, item_type, product_variant_id, packaging_type_id,
          system_quantity, counted_quantity, unit_value
        FROM inventory_items
        WHERE inventory_session_id = ${inv.id} AND counted_quantity IS NOT NULL
        ORDER BY id
      `

      // Écarts par rapport à la photo affichée à l'utilisateur (rapport).
      let itemsWithVariance = 0
      let totalVarianceValue = 0
      for (const item of items) {
        const variance = Number(item.counted_quantity) - Number(item.system_quantity)
        if (variance !== 0) {
          itemsWithVariance++
          totalVarianceValue += variance * Number(item.unit_value || 0)
        }
      }

      if (applyAdjustments) {
        const movementNotes = `Ajustement inventaire ${inv.session_number ?? ''}`.trim()

        // Total compté par variante (une variante = une ligne, mais on reste robuste).
        const countedByVariant = new Map<string, number>()
        const countedByPackaging = new Map<string, number>()
        for (const item of items) {
          if (item.item_type === 'packaging' && item.packaging_type_id) {
            countedByPackaging.set(
              item.packaging_type_id,
              (countedByPackaging.get(item.packaging_type_id) ?? 0) + Number(item.counted_quantity)
            )
          } else if (item.product_variant_id) {
            countedByVariant.set(
              item.product_variant_id,
              (countedByVariant.get(item.product_variant_id) ?? 0) + Number(item.counted_quantity)
            )
          }
        }

        for (const [variantId, counted] of countedByVariant) {
          // Stock ACTUEL (verrouillé), tous lots confondus — et non la photo de début d'inventaire.
          const rows = await tx.sql<{ quantity: number }>`
            SELECT quantity FROM stock
            WHERE depot_id = ${inv.depot_id} AND product_variant_id = ${variantId}
            FOR UPDATE
          `
          const current = rows.reduce((sum, r) => sum + Number(r.quantity), 0)
          const diff = counted - current
          const ctx = {
            companyId,
            depotId: inv.depot_id,
            variantId,
            movementType: 'inventory' as const,
            referenceType: 'inventory',
            referenceId: inv.id,
            userId,
            notes: movementNotes,
          }
          if (diff > 0) {
            await addStock(tx, { ...ctx, quantity: diff, lotNumber: null })
          } else if (diff < 0) {
            await removeStock(tx, { ...ctx, quantity: -diff })
          }
        }

        for (const [packagingTypeId, counted] of countedByPackaging) {
          await setPackagingStockLevel(tx, {
            depotId: inv.depot_id,
            packagingTypeId,
            quantity: counted,
          })
        }
      }

      await tx.sql`
        UPDATE inventory_sessions SET
          items_with_variance = ${itemsWithVariance},
          total_variance_value = ${totalVarianceValue}
        WHERE id = ${inv.id}
      `

      const summary = {
        items_with_variance: itemsWithVariance,
        total_variance_value: totalVarianceValue,
        adjustments_applied: applyAdjustments,
      }

      await tx.sql`
        INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
        VALUES (${companyId}, ${userId}, 'update', 'inventory_session', ${inv.id},
          ${JSON.stringify(summary)}::jsonb)
      `

      return summary
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    return handleRouteError(error, 'inventory.complete')
  }
}
