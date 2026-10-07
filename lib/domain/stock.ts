import type { Tx } from '../db'
import { AppError } from '../errors'

/**
 * Point d'entrée UNIQUE pour toute modification de stock.
 * À appeler à l'intérieur d'un `withTransaction`.
 *
 * Garanties :
 * - une ligne `stock` par (dépôt, variante, lot) — index unique de la migration 026 ;
 * - jamais de stock négatif : une sortie impossible lève une AppError 409
 *   (et la transaction entière est annulée) ;
 * - chaque variation écrit un `stock_movements` avec la quantité réellement
 *   appliquée, lot par lot ;
 * - les lignes touchées sont verrouillées (FOR UPDATE) : deux ventes
 *   simultanées du même produit ne peuvent pas « vendre » le même stock.
 */

export type StockMovementType =
  | 'purchase'
  | 'sale'
  | 'return'
  | 'adjustment'
  | 'transfer'
  | 'damage'
  | 'inventory'

type MovementContext = {
  companyId: string
  depotId: string
  variantId: string
  movementType: StockMovementType
  referenceType?: string | null
  referenceId?: string | null
  userId?: string | null
  notes?: string | null
}

export type LotMovement = { lotNumber: string | null; quantity: number }

async function recordMovement(tx: Tx, ctx: MovementContext, quantity: number, lotNumber: string | null) {
  await tx.sql`
    INSERT INTO stock_movements (
      company_id, depot_id, product_variant_id, movement_type, quantity,
      reference_type, reference_id, lot_number, notes, created_by
    ) VALUES (
      ${ctx.companyId}, ${ctx.depotId}, ${ctx.variantId}, ${ctx.movementType}, ${quantity},
      ${ctx.referenceType ?? null}, ${ctx.referenceId ?? null}, ${lotNumber}, ${ctx.notes ?? null},
      ${ctx.userId ?? null}
    )
  `
}

function assertPositiveInt(quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError(400, 'Quantité invalide', 'INVALID_QUANTITY')
  }
}

/** Entrée de stock (réception, retour client, transfert entrant, ajustement +). */
export async function addStock(
  tx: Tx,
  ctx: MovementContext & { quantity: number; lotNumber?: string | null; expiryDate?: string | null }
): Promise<void> {
  assertPositiveInt(ctx.quantity)
  const lot = ctx.lotNumber || null
  await tx.sql`
    INSERT INTO stock (depot_id, product_variant_id, lot_number, quantity, expiry_date)
    VALUES (${ctx.depotId}, ${ctx.variantId}, ${lot}, ${ctx.quantity}, ${ctx.expiryDate ?? null})
    ON CONFLICT (depot_id, product_variant_id, (COALESCE(lot_number, '')))
    DO UPDATE SET
      quantity = stock.quantity + EXCLUDED.quantity,
      expiry_date = COALESCE(EXCLUDED.expiry_date, stock.expiry_date),
      updated_at = NOW()
  `
  await recordMovement(tx, ctx, ctx.quantity, lot)
}

/**
 * Sortie de stock (vente, retour fournisseur, casse, transfert sortant).
 * - `lotNumber` fourni : sortie sur ce lot uniquement.
 * - sinon : FEFO — les lots qui expirent en premier sortent d'abord, puis les plus anciens.
 * Renvoie le détail des lots consommés.
 */
export async function removeStock(
  tx: Tx,
  ctx: MovementContext & { quantity: number; lotNumber?: string | null; label?: string }
): Promise<LotMovement[]> {
  assertPositiveInt(ctx.quantity)

  const rows = ctx.lotNumber
    ? await tx.sql<{ id: string; lot_number: string | null; quantity: number }>`
        SELECT id, lot_number, quantity FROM stock
        WHERE depot_id = ${ctx.depotId} AND product_variant_id = ${ctx.variantId}
          AND COALESCE(lot_number, '') = ${ctx.lotNumber} AND quantity > 0
        FOR UPDATE`
    : await tx.sql<{ id: string; lot_number: string | null; quantity: number }>`
        SELECT id, lot_number, quantity FROM stock
        WHERE depot_id = ${ctx.depotId} AND product_variant_id = ${ctx.variantId} AND quantity > 0
        ORDER BY expiry_date ASC NULLS LAST, created_at ASC, id ASC
        FOR UPDATE`

  const available = rows.reduce((sum, r) => sum + Number(r.quantity), 0)
  if (available < ctx.quantity) {
    throw new AppError(
      409,
      `Stock insuffisant${ctx.label ? ` pour ${ctx.label}` : ''} : ${available} disponible(s), ${ctx.quantity} demandé(s)`,
      'INSUFFICIENT_STOCK',
      { variantId: ctx.variantId, available, requested: ctx.quantity }
    )
  }

  const consumed: LotMovement[] = []
  let remaining = ctx.quantity
  for (const row of rows) {
    if (remaining === 0) break
    const take = Math.min(Number(row.quantity), remaining)
    await tx.sql`UPDATE stock SET quantity = quantity - ${take}, updated_at = NOW() WHERE id = ${row.id}`
    await recordMovement(tx, ctx, -take, row.lot_number)
    consumed.push({ lotNumber: row.lot_number, quantity: take })
    remaining -= take
  }
  return consumed
}

/**
 * Fixe le stock d'un lot à une valeur comptée (inventaire, ajustement absolu).
 * Le mouvement enregistré est l'écart réellement appliqué par rapport à la
 * quantité verrouillée (et non une photo potentiellement périmée).
 */
export async function setStockLevel(
  tx: Tx,
  ctx: MovementContext & { quantity: number; lotNumber?: string | null }
): Promise<number> {
  if (!Number.isInteger(ctx.quantity) || ctx.quantity < 0) {
    throw new AppError(400, 'Quantité invalide', 'INVALID_QUANTITY')
  }
  const lot = ctx.lotNumber || null
  const [current] = await tx.sql<{ id: string; quantity: number }>`
    SELECT id, quantity FROM stock
    WHERE depot_id = ${ctx.depotId} AND product_variant_id = ${ctx.variantId}
      AND COALESCE(lot_number, '') = ${lot ?? ''}
    FOR UPDATE`

  const before = current ? Number(current.quantity) : 0
  const delta = ctx.quantity - before
  if (delta === 0) return 0

  if (current) {
    await tx.sql`UPDATE stock SET quantity = ${ctx.quantity}, updated_at = NOW() WHERE id = ${current.id}`
  } else {
    await tx.sql`
      INSERT INTO stock (depot_id, product_variant_id, lot_number, quantity)
      VALUES (${ctx.depotId}, ${ctx.variantId}, ${lot}, ${ctx.quantity})`
  }
  await recordMovement(tx, ctx, delta, lot)
  return delta
}

// ----- Emballages vides (consignes) -----

/** Variation du stock d'emballages d'un dépôt (delta positif ou négatif). */
export async function adjustPackagingStock(
  tx: Tx,
  input: { depotId: string; packagingTypeId: string; delta: number; label?: string }
): Promise<void> {
  if (!Number.isInteger(input.delta) || input.delta === 0) return

  if (input.delta > 0) {
    await tx.sql`
      INSERT INTO packaging_stock (depot_id, packaging_type_id, quantity)
      VALUES (${input.depotId}, ${input.packagingTypeId}, ${input.delta})
      ON CONFLICT (depot_id, packaging_type_id)
      DO UPDATE SET quantity = packaging_stock.quantity + EXCLUDED.quantity, updated_at = NOW()`
    return
  }

  const take = -input.delta
  const { rowCount } = await tx.exec`
    UPDATE packaging_stock SET quantity = quantity - ${take}, updated_at = NOW()
    WHERE depot_id = ${input.depotId} AND packaging_type_id = ${input.packagingTypeId}
      AND quantity >= ${take}`
  if (rowCount !== 1) {
    throw new AppError(
      409,
      `Emballages vides insuffisants${input.label ? ` (${input.label})` : ''} dans ce dépôt`,
      'INSUFFICIENT_PACKAGING'
    )
  }
}

/** Fixe le stock d'emballages à une valeur comptée (inventaire). Renvoie l'écart. */
export async function setPackagingStockLevel(
  tx: Tx,
  input: { depotId: string; packagingTypeId: string; quantity: number }
): Promise<number> {
  if (!Number.isInteger(input.quantity) || input.quantity < 0) {
    throw new AppError(400, 'Quantité invalide', 'INVALID_QUANTITY')
  }
  const [current] = await tx.sql<{ quantity: number }>`
    SELECT quantity FROM packaging_stock
    WHERE depot_id = ${input.depotId} AND packaging_type_id = ${input.packagingTypeId}
    FOR UPDATE`
  const before = current ? Number(current.quantity) : 0
  await tx.sql`
    INSERT INTO packaging_stock (depot_id, packaging_type_id, quantity)
    VALUES (${input.depotId}, ${input.packagingTypeId}, ${input.quantity})
    ON CONFLICT (depot_id, packaging_type_id)
    DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()`
  return input.quantity - before
}
