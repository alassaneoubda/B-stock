import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { withTransaction } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { nextDocumentNumber } from '@/lib/sequences'
import { addStock, adjustPackagingStock, removeStock } from '@/lib/domain/stock'
import { applyCreditToOrderNotes, money, type AccountType } from '@/lib/domain/payments'

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
          if (item.condition === 'good') {
            await addStock(tx, {
              companyId,
              depotId: ret.depot_id,
              variantId: item.product_variant_id,
              quantity,
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
          await tx.sql`
            INSERT INTO credit_notes (
              company_id, client_id, sales_order_id, credit_number, account_type,
              total_amount, paid_amount, status, notes, created_by
            )
            VALUES (
              ${companyId}, ${ret.client_id}, ${ret.sales_order_id}, ${creditNumber}, ${accountType},
              ${-amount}, 0, 'paid', ${'Avoir suite retour ' + (ret.return_number ?? '')}, ${userId}
            )
          `
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
