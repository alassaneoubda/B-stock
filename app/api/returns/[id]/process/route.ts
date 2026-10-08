import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { withTransaction } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { nextDocumentNumber } from '@/lib/sequences'
import { addStock, adjustPackagingStock, removeStock } from '@/lib/domain/stock'
import { applyCreditToOrderNotes, money, type AccountType } from '@/lib/domain/payments'
import { assertPeriodOpen } from '@/lib/accounting/period-lock'
import { saleUnitCost } from '@/lib/domain/sales'
import { effectiveRate, loadVariantRates, loadVatSettings, splitTtc } from '@/lib/vat'
import type { Tx } from '@/lib/db'

/**
 * Taux de TVA des lignes produits d'un retour client : celui figé sur la vente
 * d'origine (aucune TVA si la vente n'en portait pas) ; sans vente d'origine,
 * le taux actuel du produit si l'entreprise est assujettie. null = pas de TVA.
 */
async function returnVatRates(
  tx: Tx,
  companyId: string,
  salesOrderId: string | null,
  items: Array<Record<string, any>>
): Promise<Map<string, number | null>> {
  const variantIds = [...new Set(items.map((i) => i.product_variant_id as string | null).filter((v): v is string => !!v))]
  const result = new Map<string, number | null>()
  if (variantIds.length === 0) return result
  if (salesOrderId) {
    const rows = await tx.sql`
      SELECT product_variant_id, MAX((to_jsonb(soi) ->> 'vat_rate')::numeric) AS vat_rate
      FROM sales_order_items soi
      WHERE soi.sales_order_id = ${salesOrderId} AND soi.product_variant_id = ANY(${variantIds}::uuid[])
      GROUP BY product_variant_id
    `
    for (const r of rows) result.set(r.product_variant_id, r.vat_rate == null ? null : Number(r.vat_rate))
    return result
  }
  const vat = await loadVatSettings(tx.sql, companyId)
  if (!vat.enabled) return result
  const rates = await loadVariantRates(tx.sql, variantIds)
  for (const id of variantIds) result.set(id, effectiveRate(vat, rates.get(id)))
  return result
}

const processSchema = z.object({
  action: z.enum(['approve', 'reject']).optional().default('approve'),
})

/**
 * POST /api/returns/[id]/process — Approve and process a return, or reject it.
 *
 * Retour client approuvé :
 *  - produit en bon état → réintégré en stock (addStock, mouvement 'return') ;
 *  - produit endommagé / périmé → fiche de casse approuvée (breakage_records),
 *    sans entrée en stock ;
 *  - emballages en bon état → stock d'emballages vides +quantité ;
 *    endommagés → fiche de casse.
 *  - remboursement « avoir » (refund_method = credit_note) : un avoir AV par
 *    compte (produits / emballages), le compte client est crédité du montant,
 *    et les créances ouvertes de la vente d'origine sont réduites d'autant.
 * Retour fournisseur approuvé : la marchandise SORT du stock (removeStock /
 * emballages -quantité), quel que soit son état.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('returns.process')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const returnId = (await params).id
    if (!isUuid(returnId)) throw notFound('Retour')
    const { action } = processSchema.parse(await request.json())

    const message = await withTransaction(async (tx) => {
      const [ret] = await tx.sql`
        SELECT * FROM returns WHERE id = ${returnId} AND company_id = ${companyId} FOR UPDATE
      `
      if (!ret) throw notFound('Retour')
      if (ret.status !== 'pending') {
        throw new AppError(409, 'Ce retour a déjà été traité', 'ALREADY_PROCESSED')
      }

      if (action === 'reject') {
        await tx.sql`
          UPDATE returns SET status = 'rejected', processed_by = ${userId}, processed_at = NOW(), updated_at = NOW()
          WHERE id = ${returnId}
        `
        return 'Retour rejeté'
      }

      // L'avoir (AV-…) est daté d'aujourd'hui : refusé si le mois est clôturé
      if (ret.return_type === 'client' && ret.refund_method === 'credit_note') {
        await assertPeriodOpen(tx.sql, companyId)
      }

      const items = await tx.sql`
        SELECT ri.*, p.name AS product_name, pt.name AS packaging_name
        FROM return_items ri
        LEFT JOIN product_variants pv ON pv.id = ri.product_variant_id
        LEFT JOIN products p ON p.id = pv.product_id
        LEFT JOIN packaging_types pt ON pt.id = ri.packaging_type_id
        WHERE ri.return_id = ${returnId}
      `
      if (items.length > 0 && !ret.depot_id) {
        throw new AppError(409, 'Aucun dépôt sur ce retour : impossible de mettre à jour le stock', 'NO_DEPOT')
      }

      const isClient = ret.return_type === 'client'
      const credits: Record<AccountType, number> = { product: 0, packaging: 0 }
      // TVA contenue dans l'avoir (produits uniquement ; les consignes n'en portent pas)
      let creditVat = 0
      const vatRateOf = isClient ? await returnVatRates(tx, companyId, ret.sales_order_id, items) : new Map()
      const note = `Retour ${ret.return_number ?? ''}`.trim()

      for (const item of items) {
        const quantity = Number(item.quantity)
        if (!(quantity > 0)) continue
        const lineTotal = money(Number(item.total_price ?? quantity * Number(item.unit_price || 0)))
        const isPackaging = item.item_type === 'packaging' || (!item.product_variant_id && item.packaging_type_id)

        if (isPackaging) {
          if (!item.packaging_type_id) continue
          if (isClient) {
            credits.packaging += lineTotal
            if (item.condition === 'good') {
              await adjustPackagingStock(tx, { depotId: ret.depot_id, packagingTypeId: item.packaging_type_id, delta: quantity })
            } else {
              await tx.sql`
                INSERT INTO breakage_records (
                  company_id, depot_id, record_type, packaging_type_id, item_type, quantity,
                  unit_value, total_value, reason, reported_by, approved_by, status
                ) VALUES (
                  ${companyId}, ${ret.depot_id}, 'breakage', ${item.packaging_type_id}, 'packaging', ${quantity},
                  ${Number(item.unit_price || 0)}, ${lineTotal}, ${`${note} - emballage endommagé`},
                  ${userId}, ${userId}, 'approved'
                )
              `
            }
          } else {
            await adjustPackagingStock(tx, {
              depotId: ret.depot_id,
              packagingTypeId: item.packaging_type_id,
              delta: -quantity,
              label: item.packaging_name ?? undefined,
            })
          }
          continue
        }

        if (!item.product_variant_id) continue
        if (isClient) {
          credits.product += lineTotal
          const rate = vatRateOf.get(item.product_variant_id)
          if (rate != null) {
            // Décomposition figée sur la ligne du retour (même taux que la vente d'origine)
            const split = splitTtc(lineTotal, rate)
            creditVat = money(creditVat + split.vat)
            await tx.sql`
              UPDATE return_items SET vat_rate = ${split.rate}, amount_ht = ${split.ht}, vat_amount = ${split.vat}
              WHERE id = ${item.id}
            `
          }
          if (item.condition === 'good') {
            // Réintégré au coût de la vente d'origine si elle est connue, sinon au CMP du dépôt
            await addStock(tx, {
              companyId,
              depotId: ret.depot_id,
              variantId: item.product_variant_id,
              quantity,
              unitCost: ret.sales_order_id ? await saleUnitCost(tx, ret.sales_order_id, item.product_variant_id) : null,
              movementType: 'return',
              referenceType: 'return',
              referenceId: returnId,
              userId,
              notes: note,
            })
          } else {
            // Endommagé ou périmé : jamais remis en stock, tracé en casse
            await tx.sql`
              INSERT INTO breakage_records (
                company_id, depot_id, record_type, product_variant_id, item_type, quantity,
                unit_value, total_value, reason, reported_by, approved_by, status
              ) VALUES (
                ${companyId}, ${ret.depot_id}, ${item.condition === 'expired' ? 'expiry' : 'breakage'},
                ${item.product_variant_id}, 'product', ${quantity},
                ${Number(item.unit_price || 0)}, ${lineTotal},
                ${item.condition === 'expired' ? `${note} - produit périmé` : `${note} - produit endommagé`},
                ${userId}, ${userId}, 'approved'
              )
            `
          }
        } else {
          await removeStock(tx, {
            companyId,
            depotId: ret.depot_id,
            variantId: item.product_variant_id,
            quantity,
            movementType: 'return',
            referenceType: 'return',
            referenceId: returnId,
            userId,
            notes: note,
            label: item.product_name ?? undefined,
          })
        }
      }

      // Avoir client
      if (isClient && ret.refund_method === 'credit_note' && ret.client_id) {
        for (const accountType of ['product', 'packaging'] as AccountType[]) {
          const amount = money(credits[accountType])
          if (amount <= 0) continue
          const creditNumber = await nextDocumentNumber(tx, companyId, 'credit_note')
          const [avoir] = await tx.sql`
            INSERT INTO credit_notes (
              company_id, client_id, sales_order_id, credit_number, account_type,
              total_amount, paid_amount, status, notes, created_by
            )
            VALUES (
              ${companyId}, ${ret.client_id}, ${ret.sales_order_id}, ${creditNumber}, ${accountType},
              ${-amount}, 0, 'paid', ${'Avoir suite retour ' + (ret.return_number ?? '')}, ${userId}
            )
            RETURNING id
          `
          if (accountType === 'product' && creditVat !== 0) {
            // Même signe que total_amount (avoir négatif)
            await tx.sql`UPDATE credit_notes SET vat_amount = ${-creditVat} WHERE id = ${avoir.id}`
          }
          // La dette restante de la vente d'origine diminue d'autant
          if (ret.sales_order_id) {
            await applyCreditToOrderNotes(tx, { companyId, orderId: ret.sales_order_id, accountType, amount })
          }
          // Compte client crédité (solde positif = en faveur du client)
          await tx.sql`
            INSERT INTO client_accounts (client_id, account_type, balance, last_transaction_at)
            VALUES (${ret.client_id}, ${accountType}, ${amount}, NOW())
            ON CONFLICT (client_id, account_type) DO UPDATE
            SET balance = client_accounts.balance + EXCLUDED.balance, last_transaction_at = NOW(), updated_at = NOW()
          `
        }
      }

      const { rowCount } = await tx.exec`
        UPDATE returns SET status = 'processed', processed_by = ${userId}, processed_at = NOW(), updated_at = NOW()
        WHERE id = ${returnId} AND status = 'pending'
      `
      if (rowCount !== 1) throw new AppError(409, 'Ce retour a déjà été traité', 'ALREADY_PROCESSED')
      return 'Retour traité avec succès'
    })

    return NextResponse.json({ success: true, message })
  } catch (error) {
    return handleRouteError(error, 'returns.process')
  }
}
