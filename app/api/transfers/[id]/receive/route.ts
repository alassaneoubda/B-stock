import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { withTransaction, type Tx } from '@/lib/db'
import { AppError, badRequest, handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { addStock, adjustPackagingStock, getAvgCost, removeStock, type LotMovement } from '@/lib/domain/stock'

const receiveSchema = z.object({
  // Absent ou vide : tout est considéré reçu tel qu'envoyé (cas de l'écran actuel).
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        quantity_received: z.number().int().nonnegative().nullish(),
        // Ignoré : la casse est toujours déduite (envoyé - reçu).
        quantity_damaged: z.number().int().nonnegative().nullish(),
      })
    )
    .optional()
    .default([]),
})

/** `pending` : rien n'a encore quitté la source. `in_transit` : la source a déjà été débitée. */
const RECEIVABLE_STATUSES = ['pending', 'in_transit']

type TransferItemRow = {
  id: string
  product_variant_id: string | null
  packaging_type_id: string | null
  item_type: string | null
  quantity_sent: number
  unit_value: string | null
  label: string | null
}

/** Répartit la quantité reçue sur les lots sortis de la source (la perte est imputée aux derniers lots). */
function splitReceivedAcrossLots(consumed: LotMovement[], received: number): LotMovement[] {
  const result: LotMovement[] = []
  let left = received
  for (const lot of consumed) {
    if (left === 0) break
    const take = Math.min(lot.quantity, left)
    result.push({ lotNumber: lot.lotNumber, quantity: take, unitCost: lot.unitCost })
    left -= take
  }
  return result
}

async function lotExpiry(tx: Tx, depotId: string, variantId: string, lotNumber: string) {
  const [row] = await tx.sql<{ expiry_date: string | null }>`
    SELECT expiry_date::text AS expiry_date FROM stock
    WHERE depot_id = ${depotId} AND product_variant_id = ${variantId}
      AND COALESCE(lot_number, '') = ${lotNumber}
  `
  return row?.expiry_date ?? null
}

// POST /api/transfers/[id]/receive — Receive a depot transfer (deduct source, add destination)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('transfers.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const transferId = (await params).id
    if (!isUuid(transferId)) throw notFound('Transfert')

    const rawBody = await request.json().catch(() => ({}))
    const data = receiveSchema.parse(rawBody ?? {})

    const ids = data.items.map((i) => i.id)
    if (new Set(ids).size !== ids.length) {
      throw badRequest('Une même ligne de transfert apparaît plusieurs fois')
    }

    const result = await withTransaction(async (tx) => {
      const [transfer] = await tx.sql<{
        id: string
        status: string
        transfer_number: string | null
        source_depot_id: string
        destination_depot_id: string
      }>`
        SELECT id, status, transfer_number, source_depot_id, destination_depot_id
        FROM depot_transfers
        WHERE id = ${transferId} AND company_id = ${companyId}
        FOR UPDATE
      `
      if (!transfer) throw notFound('Transfert')
      if (!RECEIVABLE_STATUSES.includes(transfer.status)) {
        throw new AppError(
          409,
          transfer.status === 'received' || transfer.status === 'partial'
            ? 'Transfert déjà réceptionné'
            : 'Ce transfert ne peut pas être réceptionné dans son état actuel',
          'INVALID_STATUS'
        )
      }

      const transferItems = await tx.sql<TransferItemRow>`
        SELECT dti.id, dti.product_variant_id, dti.packaging_type_id, dti.item_type, dti.quantity_sent,
          COALESCE(pv.price, pt_pkg.deposit_price, 0) AS unit_value,
          COALESCE(p.name || COALESCE(' — ' || pt_var.name, ''), pt_pkg.name) AS label
        FROM depot_transfer_items dti
        LEFT JOIN product_variants pv ON pv.id = dti.product_variant_id
        LEFT JOIN products p ON p.id = pv.product_id
        LEFT JOIN packaging_types pt_var ON pt_var.id = pv.packaging_type_id
        LEFT JOIN packaging_types pt_pkg ON pt_pkg.id = dti.packaging_type_id
        WHERE dti.depot_transfer_id = ${transfer.id}
        ORDER BY dti.created_at, dti.id
      `
      const itemIds = new Set(transferItems.map((i) => i.id))
      const receivedById = new Map<string, number | null | undefined>()
      for (const it of data.items) {
        if (!itemIds.has(it.id)) throw notFound('Ligne de transfert')
        receivedById.set(it.id, it.quantity_received)
      }

      const reference = transfer.transfer_number || transfer.id
      const deductSource = transfer.status === 'pending'
      let allReceived = true

      for (const item of transferItems) {
        const sent = Number(item.quantity_sent)
        const provided = receivedById.get(item.id)
        const received = provided == null ? sent : provided
        if (received > sent) {
          throw new AppError(
            409,
            `Quantité reçue (${received}) supérieure à la quantité envoyée (${sent})${item.label ? ` pour ${item.label}` : ''}`,
            'OVER_RECEPTION'
          )
        }
        const damaged = sent - received
        if (damaged > 0) allReceived = false

        const movement = {
          companyId,
          movementType: 'transfer' as const,
          referenceType: 'depot_transfer',
          referenceId: transfer.id,
          userId,
          notes: `Transfert ${reference}`,
        }

        if (item.product_variant_id) {
          const variantId = item.product_variant_id
          if (deductSource && sent > 0) {
            const consumed = await removeStock(tx, {
              ...movement,
              depotId: transfer.source_depot_id,
              variantId,
              quantity: sent,
              label: item.label ?? undefined,
            })
            // Les lots (et leur péremption) suivent la marchandise jusqu'au dépôt de destination,
            // valorisés au coût du dépôt source (le CMP de la destination est recalculé).
            for (const lot of splitReceivedAcrossLots(consumed, received)) {
              const expiryDate = lot.lotNumber
                ? await lotExpiry(tx, transfer.source_depot_id, variantId, lot.lotNumber)
                : null
              await addStock(tx, {
                ...movement,
                depotId: transfer.destination_depot_id,
                variantId,
                quantity: lot.quantity,
                lotNumber: lot.lotNumber,
                expiryDate,
                unitCost: lot.unitCost,
              })
            }
          } else if (received > 0) {
            // Source déjà débitée : coût de sortie du transfert, à défaut CMP du dépôt source
            const [out] = await tx.sql<{ unit_cost: string | null }>`
              SELECT SUM(quantity * unit_cost) / NULLIF(SUM(quantity), 0) AS unit_cost
              FROM stock_movements
              WHERE company_id = ${companyId} AND reference_type = 'depot_transfer'
                AND reference_id = ${transfer.id} AND depot_id = ${transfer.source_depot_id}
                AND product_variant_id = ${variantId} AND quantity < 0 AND unit_cost IS NOT NULL
            `
            await addStock(tx, {
              ...movement,
              depotId: transfer.destination_depot_id,
              variantId,
              quantity: received,
              unitCost:
                out?.unit_cost != null
                  ? Number(out.unit_cost)
                  : await getAvgCost(tx, transfer.source_depot_id, variantId),
            })
          }
        } else if (item.packaging_type_id) {
          if (deductSource) {
            await adjustPackagingStock(tx, {
              depotId: transfer.source_depot_id,
              packagingTypeId: item.packaging_type_id,
              delta: -sent,
              label: item.label ?? undefined,
            })
          }
          await adjustPackagingStock(tx, {
            depotId: transfer.destination_depot_id,
            packagingTypeId: item.packaging_type_id,
            delta: received,
          })
        }

        await tx.sql`
          UPDATE depot_transfer_items
          SET quantity_received = ${received}, quantity_damaged = ${damaged}
          WHERE id = ${item.id}
        `

        // La différence est perdue en route : on la trace comme casse déjà approuvée
        // (le stock n'a pas été crédité, il n'y a donc rien à déduire).
        if (damaged > 0 && (item.product_variant_id || item.packaging_type_id)) {
          const unitValue = Number(item.unit_value || 0)
          await tx.sql`
            INSERT INTO breakage_records (
              company_id, depot_id, record_type, product_variant_id, packaging_type_id, item_type,
              quantity, unit_value, total_value, reason, reported_by, approved_by, status
            ) VALUES (
              ${companyId}, ${transfer.destination_depot_id}, 'breakage',
              ${item.product_variant_id}, ${item.packaging_type_id},
              ${item.product_variant_id ? 'product' : 'packaging'},
              ${damaged}, ${unitValue}, ${damaged * unitValue},
              ${`Transfert ${reference}`}, ${userId}, ${userId}, 'approved'
            )
          `
        }
      }

      const status = allReceived ? 'received' : 'partial'
      await tx.sql`
        UPDATE depot_transfers
        SET status = ${status}, received_by = ${userId}, received_at = NOW(),
            shipped_at = COALESCE(shipped_at, NOW()), updated_at = NOW()
        WHERE id = ${transfer.id}
      `
      return { status }
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: result.status === 'received' ? 'Transfert réceptionné' : 'Transfert réceptionné partiellement',
    })
  } catch (error) {
    return handleRouteError(error, 'transfers.receive')
  }
}
