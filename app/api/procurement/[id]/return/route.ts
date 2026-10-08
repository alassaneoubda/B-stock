import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { withTransaction } from '@/lib/db'
import { AppError, badRequest, handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { removeStock } from '@/lib/domain/stock'
import { assertPeriodOpen } from '@/lib/accounting/period-lock'

const returnSchema = z.object({
  items: z
    .array(
      z.object({
        productVariantId: z.string().uuid(),
        quantity: z.number().int().positive(),
        // Conservé pour compatibilité ; non utilisé pour le calcul du stock.
        unitPrice: z.number().nonnegative().optional(),
      })
    )
    .min(1, 'Au moins un article est requis'),
  reason: z.string().trim().max(1000).optional(),
})

/** Pas de retour sur une commande non réceptionnée ou annulée. */
const NON_RETURNABLE_STATUSES = ['pending', 'cancelled']

// POST /api/procurement/[id]/return — retour fournisseur de marchandises reçues
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await requirePermission('purchases.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const { id } = await params
    if (!isUuid(id)) throw notFound('Approvisionnement')

    const data = returnSchema.parse(await request.json())

    // Regroupe les éventuels doublons par variante.
    const requested = new Map<string, number>()
    for (const item of data.items) {
      requested.set(item.productVariantId, (requested.get(item.productVariantId) ?? 0) + item.quantity)
    }

    await withTransaction(async (tx) => {
      // Mois clôturé (export comptable transmis) : opération refusée
      await assertPeriodOpen(tx.sql, companyId)
      const [po] = await tx.sql<{ id: string; depot_id: string; status: string; order_number: string }>`
        SELECT id, depot_id, status, order_number FROM purchase_orders
        WHERE id = ${id} AND company_id = ${companyId}
        FOR UPDATE
      `
      if (!po) throw notFound('Approvisionnement')
      if (NON_RETURNABLE_STATUSES.includes(po.status)) {
        throw new AppError(
          409,
          "Retour impossible : cette commande n'a pas encore été réceptionnée",
          'INVALID_STATUS'
        )
      }

      const variantIds = [...requested.keys()]

      // Quantités reçues sur cette commande, par variante.
      const received = await tx.sql<{ product_variant_id: string; received: number }>`
        SELECT product_variant_id, COALESCE(SUM(quantity_received), 0)::int AS received
        FROM purchase_order_items
        WHERE purchase_order_id = ${po.id} AND product_variant_id = ANY(${variantIds}::uuid[])
        GROUP BY product_variant_id
      `
      // Quantités déjà retournées au fournisseur pour cette commande.
      const returned = await tx.sql<{ product_variant_id: string; returned: number }>`
        SELECT product_variant_id, COALESCE(-SUM(quantity), 0)::int AS returned
        FROM stock_movements
        WHERE company_id = ${companyId}
          AND reference_type = 'purchase_order' AND reference_id = ${po.id}
          AND movement_type = 'return'
          AND product_variant_id = ANY(${variantIds}::uuid[])
        GROUP BY product_variant_id
      `
      const receivedMap = new Map(received.map((r) => [r.product_variant_id, Number(r.received)]))
      const returnedMap = new Map(returned.map((r) => [r.product_variant_id, Number(r.returned)]))

      for (const [variantId, quantity] of requested) {
        if (!receivedMap.has(variantId)) {
          throw badRequest('Ce produit ne fait pas partie de la commande')
        }
        const returnable = (receivedMap.get(variantId) ?? 0) - (returnedMap.get(variantId) ?? 0)
        if (quantity > returnable) {
          throw new AppError(
            409,
            `Quantité retournée (${quantity}) supérieure à la quantité reçue non encore retournée (${Math.max(returnable, 0)})`,
            'OVER_RETURN'
          )
        }

        await removeStock(tx, {
          companyId,
          depotId: po.depot_id,
          variantId,
          quantity,
          movementType: 'return',
          referenceType: 'purchase_order',
          referenceId: po.id,
          userId,
          notes: data.reason || 'Retour fournisseur',
          label: 'le retour fournisseur',
        })
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Retour fournisseur enregistré avec succès',
    })
  } catch (error) {
    return handleRouteError(error, 'procurement.return')
  }
}
