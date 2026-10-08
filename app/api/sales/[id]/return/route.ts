import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { withTransaction } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { assertOwned, isUuid } from '@/lib/tenant'
import { addStock, adjustPackagingStock } from '@/lib/domain/stock'
import { applyCreditToOrderNotes, money } from '@/lib/domain/payments'
import { saleUnitCost } from '@/lib/domain/sales'
import { assertPeriodOpen } from '@/lib/accounting/period-lock'

const returnSchema = z.object({
  items: z
    .array(
      z.object({
        productVariantId: z.string().uuid(),
        quantity: z.coerce.number().int().positive(),
        /** Ignoré : le prix crédité est celui de la vente d'origine. */
        unitPrice: z.coerce.number().min(0).optional(),
      })
    )
    .max(200)
    .default([]),
  packagingItems: z
    .array(
      z.object({
        packagingTypeId: z.string().uuid(),
        quantityIn: z.coerce.number().int().min(0), // Packaging returned to stock
        /** Ignoré : le prix crédité est celui de la vente d'origine. */
        unitPrice: z.coerce.number().min(0).optional(),
      })
    )
    .max(200)
    .optional(),
  reason: z.string().max(1000).optional(),
})

/**
 * POST /api/sales/[id]/return — Retour direct sur une vente.
 *
 * - Quantités limitées à « vendu − déjà retourné » sur cette vente (retours
 *   directs précédents = mouvements de stock 'return' référencés sur la vente,
 *   + lignes des retours /api/returns non rejetés liés à la vente).
 * - Emballages limités au net sorti non encore rendu (transactions d'emballages
 *   'given' − 'returned' de la vente, ou à défaut sorties − retours de la vente).
 * - Prix crédités = prix de la vente d'origine.
 * - Stock via addStock / adjustPackagingStock ; compte client crédité ; créances
 *   ouvertes de la vente réduites d'autant. Le tout dans une seule transaction.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await requirePermission('returns.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const { id } = await params
    if (!isUuid(id)) throw notFound('Commande')
    const data = returnSchema.parse(await request.json())
    const packagingInput = (data.packagingItems ?? []).filter((p) => p.quantityIn > 0)
    if (data.items.length === 0 && packagingInput.length === 0) {
      throw new AppError(400, 'Aucun article à retourner', 'BAD_REQUEST')
    }

    const credits = await withTransaction(async (tx) => {
      // Le retour (stock, crédit client) est daté d'aujourd'hui : refusé si le mois est clôturé
      await assertPeriodOpen(tx.sql, companyId)

      // Vente verrouillée : deux retours simultanés ne peuvent pas dépasser la quantité vendue
      const [order] = await tx.sql`
        SELECT id, client_id, depot_id, status, order_number FROM sales_orders
        WHERE id = ${id} AND company_id = ${companyId}
        FOR UPDATE
      `
      if (!order) throw notFound('Commande')
      if (order.status === 'cancelled') {
        throw new AppError(409, 'Cette vente est annulée : aucun retour possible', 'ORDER_CANCELLED')
      }
      if (!order.depot_id) throw new AppError(409, 'Aucun dépôt sur cette vente', 'NO_DEPOT')

      await assertOwned(tx.sql, companyId, {
        variants: data.items.map((i) => i.productVariantId),
        packagingTypes: packagingInput.map((p) => p.packagingTypeId),
      })

      const reason = data.reason || `Retour de vente ${order.order_number ?? ''}`.trim()

      // ---- Produits ----
      const requested = new Map<string, number>()
      for (const i of data.items) requested.set(i.productVariantId, (requested.get(i.productVariantId) ?? 0) + i.quantity)

      let totalProductCredit = 0
      if (requested.size > 0) {
        const sold = await tx.sql`
          SELECT soi.product_variant_id,
                 SUM(soi.quantity)::int AS sold,
                 SUM(COALESCE(soi.total_price, soi.quantity * soi.unit_price)) AS sold_value,
                 COALESCE((
                   SELECT SUM(sm.quantity) FROM stock_movements sm
                   WHERE sm.company_id = ${companyId} AND sm.movement_type = 'return'
                     AND sm.reference_type = 'sales_order' AND sm.reference_id = ${order.id}
                     AND sm.product_variant_id = soi.product_variant_id
                 ), 0)::int
                 + COALESCE((
                   SELECT SUM(ri.quantity) FROM return_items ri
                   JOIN returns r ON r.id = ri.return_id
                   WHERE r.sales_order_id = ${order.id} AND r.company_id = ${companyId}
                     AND r.status <> 'rejected' AND ri.item_type = 'product'
                     AND ri.product_variant_id = soi.product_variant_id
                 ), 0)::int AS returned
          FROM sales_order_items soi
          WHERE soi.sales_order_id = ${order.id}
          GROUP BY soi.product_variant_id
        `
        const soldMap = new Map(sold.map((s) => [s.product_variant_id as string, s]))

        for (const [variantId, quantity] of requested) {
          const s = soldMap.get(variantId)
          const available = s ? Number(s.sold) - Number(s.returned) : 0
          if (quantity > available) {
            throw new AppError(
              409,
              `Quantité retournée supérieure à la quantité vendue restante sur cette vente (${Math.max(available, 0)} au maximum)`,
              'RETURN_EXCEEDS_SOLD',
              { variantId, available: Math.max(available, 0), requested: quantity }
            )
          }
          const unitPrice = Number(s!.sold_value) / Number(s!.sold)
          totalProductCredit += money(quantity * unitPrice)

          // Réintégré au coût de revient figé lors de la vente d'origine
          await addStock(tx, {
            companyId,
            depotId: order.depot_id,
            variantId,
            quantity,
            unitCost: await saleUnitCost(tx, order.id, variantId),
            movementType: 'return',
            referenceType: 'sales_order',
            referenceId: order.id,
            userId,
            notes: reason,
          })
        }
      }
      totalProductCredit = money(totalProductCredit)

      // ---- Emballages ----
      let totalPackagingCredit = 0
      if (packagingInput.length > 0) {
        const pkgRows = await tx.sql`
          SELECT sopi.packaging_type_id,
                 SUM(sopi.quantity_out - sopi.quantity_in)::int AS net_out,
                 MAX(COALESCE(sopi.unit_price, 0)) AS unit_price,
                 (SELECT COUNT(*) FROM packaging_transactions pt
                   WHERE pt.sales_order_id = ${order.id} AND pt.company_id = ${companyId}
                     AND pt.packaging_type_id = sopi.packaging_type_id)::int AS txn_count,
                 COALESCE((SELECT SUM(CASE WHEN pt.transaction_type = 'given' THEN pt.quantity
                                           WHEN pt.transaction_type = 'returned' THEN -pt.quantity ELSE 0 END)
                   FROM packaging_transactions pt
                   WHERE pt.sales_order_id = ${order.id} AND pt.company_id = ${companyId}
                     AND pt.packaging_type_id = sopi.packaging_type_id), 0)::int AS txn_outstanding
          FROM sales_order_packaging_items sopi
          WHERE sopi.sales_order_id = ${order.id}
          GROUP BY sopi.packaging_type_id
        `
        const pkgMap = new Map(pkgRows.map((r) => [r.packaging_type_id as string, r]))
        const requestedPkg = new Map<string, number>()
        for (const p of packagingInput) {
          requestedPkg.set(p.packagingTypeId, (requestedPkg.get(p.packagingTypeId) ?? 0) + p.quantityIn)
        }

        for (const [packagingTypeId, quantityIn] of requestedPkg) {
          const r = pkgMap.get(packagingTypeId)
          const outstanding = r ? (Number(r.txn_count) > 0 ? Number(r.txn_outstanding) : Number(r.net_out)) : 0
          if (quantityIn > outstanding) {
            throw new AppError(
              409,
              `Emballages rendus supérieurs aux emballages sortis non rendus sur cette vente (${Math.max(outstanding, 0)} au maximum)`,
              'RETURN_EXCEEDS_SOLD',
              { packagingTypeId, available: Math.max(outstanding, 0), requested: quantityIn }
            )
          }
          const unitPrice = Number(r!.unit_price)
          const amount = money(quantityIn * unitPrice)
          totalPackagingCredit += amount

          await adjustPackagingStock(tx, { depotId: order.depot_id, packagingTypeId, delta: quantityIn })
          await tx.sql`
            INSERT INTO packaging_transactions (
              company_id, client_id, sales_order_id,
              packaging_type_id, transaction_type, quantity,
              unit_price, total_amount, created_by
            ) VALUES (
              ${companyId}, ${order.client_id}, ${order.id},
              ${packagingTypeId}, 'returned', ${quantityIn},
              ${unitPrice}, ${amount}, ${userId}
            )
          `
        }
      }
      totalPackagingCredit = money(totalPackagingCredit)

      // ---- Comptes client et créances de la vente ----
      for (const [accountType, amount] of [
        ['product', totalProductCredit],
        ['packaging', totalPackagingCredit],
      ] as const) {
        if (amount <= 0 || !order.client_id) continue
        await applyCreditToOrderNotes(tx, { companyId, orderId: order.id, accountType, amount })
        await tx.sql`
          INSERT INTO client_accounts (client_id, account_type, balance, last_transaction_at)
          VALUES (${order.client_id}, ${accountType}, ${amount}, NOW())
          ON CONFLICT (client_id, account_type) DO UPDATE
          SET balance = client_accounts.balance + EXCLUDED.balance, last_transaction_at = NOW(), updated_at = NOW()
        `
      }

      return { products: totalProductCredit, packaging: totalPackagingCredit }
    })

    return NextResponse.json({
      success: true,
      message: 'Retour enregistré avec succès',
      credits,
    })
  } catch (error) {
    return handleRouteError(error, 'sales.return')
  }
}
