import type { Tx } from '../db'
import { AppError, notFound } from '../errors'

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
  | 'unpack'

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

/** Lot consommé par une sortie, avec le coût unitaire (CMP) figé au moment de la sortie. */
export type LotMovement = { lotNumber: string | null; quantity: number; unitCost: number }

// ----- Coût moyen pondéré (CMP) par dépôt et variante -----
//
// Invariant : la valeur du stock d'un couple (dépôt, variante) est
// quantité × CMP, et elle est égale à la somme des mouvements valorisés
// (quantité × unit_cost). Les entrées sont valorisées à leur coût propre
// (prix d'achat, coût du dépôt source, coût de la vente d'origine…) et
// recalculent le CMP ; les sorties partent au CMP et ne le modifient pas.

const COST_SCALE = 10_000

/** Arrondi d'un coût unitaire (4 décimales, comme la colonne NUMERIC(14,4)). */
export function roundCost(value: number): number {
  return Math.round(value * COST_SCALE) / COST_SCALE
}

/**
 * Verrouille la ligne de CMP du couple (dépôt, variante) et renvoie sa valeur.
 * La ligne est créée au besoin, initialisée au prix d'achat de la variante.
 * Toujours appelée AVANT de verrouiller les lignes `stock` (ordre de verrouillage
 * unique : pas d'interblocage entre une entrée et une sortie simultanées).
 */
async function lockAvgCost(tx: Tx, depotId: string, variantId: string): Promise<number> {
  await tx.sql`
    INSERT INTO stock_costs (depot_id, product_variant_id, avg_cost)
    SELECT ${depotId}, pv.id, GREATEST(COALESCE(pv.cost_price, 0), 0)
    FROM product_variants pv WHERE pv.id = ${variantId}
    ON CONFLICT (depot_id, product_variant_id) DO NOTHING
  `
  const [row] = await tx.sql<{ avg_cost: string }>`
    SELECT avg_cost FROM stock_costs
    WHERE depot_id = ${depotId} AND product_variant_id = ${variantId}
    FOR UPDATE
  `
  return row ? Number(row.avg_cost) : 0
}

/**
 * Verrouille les lignes de CMP de plusieurs variantes d'un dépôt, dans un ordre
 * déterministe (par identifiant). À appeler AVANT tout verrou sur `stock` quand
 * une opération touche plusieurs variantes (ouverture de casier, point de vente).
 */
export async function lockStockCosts(tx: Tx, depotId: string, variantIds: string[]): Promise<void> {
  for (const id of [...new Set(variantIds)].sort()) {
    await lockAvgCost(tx, depotId, id)
  }
}

/** CMP courant d'un couple (dépôt, variante), sans verrou (repli : prix d'achat de la variante). */
export async function getAvgCost(tx: Tx, depotId: string, variantId: string): Promise<number> {
  const [row] = await tx.sql<{ avg_cost: string | null }>`
    SELECT COALESCE(
      (SELECT avg_cost FROM stock_costs WHERE depot_id = ${depotId} AND product_variant_id = ${variantId}),
      (SELECT cost_price FROM product_variants WHERE id = ${variantId}),
      0
    ) AS avg_cost
  `
  return Math.max(0, Number(row?.avg_cost ?? 0))
}

async function recordMovement(
  tx: Tx,
  ctx: MovementContext,
  quantity: number,
  lotNumber: string | null,
  unitCost: number
) {
  await tx.sql`
    INSERT INTO stock_movements (
      company_id, depot_id, product_variant_id, movement_type, quantity,
      reference_type, reference_id, lot_number, notes, created_by, unit_cost
    ) VALUES (
      ${ctx.companyId}, ${ctx.depotId}, ${ctx.variantId}, ${ctx.movementType}, ${quantity},
      ${ctx.referenceType ?? null}, ${ctx.referenceId ?? null}, ${lotNumber}, ${ctx.notes ?? null},
      ${ctx.userId ?? null}, ${roundCost(unitCost)}
    )
  `
}

function assertPositiveInt(quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError(400, 'Quantité invalide', 'INVALID_QUANTITY')
  }
}

/**
 * Entrée de stock (réception, retour client, transfert entrant, ajustement +).
 * - `unitCost` fourni : entrée valorisée à ce coût, le CMP du dépôt est recalculé
 *   CMP = (qté avant × CMP avant + qté entrée × coût) / (qté avant + qté entrée).
 * - sinon : entrée au CMP courant (ajustement, inventaire), le CMP ne bouge pas.
 * Renvoie le coût unitaire enregistré sur le mouvement.
 */
export async function addStock(
  tx: Tx,
  ctx: MovementContext & {
    quantity: number
    lotNumber?: string | null
    expiryDate?: string | null
    unitCost?: number | null
  }
): Promise<number> {
  assertPositiveInt(ctx.quantity)
  const lot = ctx.lotNumber || null

  const avgCost = await lockAvgCost(tx, ctx.depotId, ctx.variantId)
  let unitCost = avgCost
  if (ctx.unitCost != null && Number.isFinite(Number(ctx.unitCost))) {
    unitCost = roundCost(Math.max(0, Number(ctx.unitCost)))
    const [{ qty }] = await tx.sql<{ qty: number }>`
      SELECT COALESCE(SUM(quantity), 0)::int AS qty FROM stock
      WHERE depot_id = ${ctx.depotId} AND product_variant_id = ${ctx.variantId}
    `
    const before = Math.max(0, Number(qty))
    const newAvg = roundCost((before * avgCost + ctx.quantity * unitCost) / (before + ctx.quantity))
    if (newAvg !== avgCost) {
      await tx.sql`
        UPDATE stock_costs SET avg_cost = ${newAvg}, updated_at = NOW()
        WHERE depot_id = ${ctx.depotId} AND product_variant_id = ${ctx.variantId}
      `
    }
  }

  await tx.sql`
    INSERT INTO stock (depot_id, product_variant_id, lot_number, quantity, expiry_date)
    VALUES (${ctx.depotId}, ${ctx.variantId}, ${lot}, ${ctx.quantity}, ${ctx.expiryDate ?? null})
    ON CONFLICT (depot_id, product_variant_id, (COALESCE(lot_number, '')))
    DO UPDATE SET
      quantity = stock.quantity + EXCLUDED.quantity,
      expiry_date = COALESCE(EXCLUDED.expiry_date, stock.expiry_date),
      updated_at = NOW()
  `
  await recordMovement(tx, ctx, ctx.quantity, lot, unitCost)
  return unitCost
}

/**
 * Sortie de stock (vente, retour fournisseur, casse, transfert sortant).
 * - `lotNumber` fourni : sortie sur ce lot uniquement.
 * - sinon : FEFO — les lots qui expirent en premier sortent d'abord, puis les plus anciens.
 * La sortie est valorisée au CMP du dépôt (inchangé par la sortie).
 * Renvoie le détail des lots consommés avec leur coût unitaire.
 */
export async function removeStock(
  tx: Tx,
  ctx: MovementContext & { quantity: number; lotNumber?: string | null; label?: string }
): Promise<LotMovement[]> {
  assertPositiveInt(ctx.quantity)
  const unitCost = await lockAvgCost(tx, ctx.depotId, ctx.variantId)

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
    await recordMovement(tx, ctx, -take, row.lot_number, unitCost)
    consumed.push({ lotNumber: row.lot_number, quantity: take, unitCost })
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
  // Écart valorisé au CMP (un surplus d'inventaire ne modifie pas le coût moyen)
  const unitCost = await lockAvgCost(tx, ctx.depotId, ctx.variantId)
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
  await recordMovement(tx, ctx, delta, lot, unitCost)
  return delta
}

// ----- Ouverture de casier (déconditionnement) -----

export type UnpackLink = {
  packVariantId: string
  unitVariantId: string
  unitsPerPack: number
  /** « Bock — 66 cl · Casier de 12 » */
  label: string
}

/** Lien conditionnement → unité d'une variante de l'entreprise (erreurs métier explicites). */
export async function getUnpackLink(tx: Tx, companyId: string, packVariantId: string): Promise<UnpackLink> {
  const [row] = await tx.sql<{
    unit_variant_id: string | null
    units_per_case: number | null
    product_name: string
    packaging_name: string | null
    same_product: boolean | null
  }>`
    SELECT pv.unit_variant_id, pt.units_per_case, p.name AS product_name, pt.name AS packaging_name,
           (uv.product_id = pv.product_id) AS same_product
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN packaging_types pt ON pt.id = pv.packaging_type_id
    LEFT JOIN product_variants uv ON uv.id = pv.unit_variant_id
    WHERE pv.id = ${packVariantId} AND p.company_id = ${companyId}
  `
  if (!row) throw notFound('Variante')
  const label = `${row.product_name}${row.packaging_name ? ` — ${row.packaging_name}` : ''}`
  const unitsPerPack = Number(row.units_per_case ?? 1)
  if (unitsPerPack <= 1) {
    throw new AppError(409, `${label} : ce format ne contient qu'une unité, il ne peut pas être ouvert`, 'NOT_A_PACK')
  }
  if (!row.unit_variant_id || !row.same_product) {
    throw new AppError(
      409,
      `${label} : activez d'abord la vente à l'unité (« Vendre aussi à la bouteille ») sur la fiche produit`,
      'NO_UNIT_VARIANT'
    )
  }
  return { packVariantId, unitVariantId: row.unit_variant_id, unitsPerPack, label }
}

export type UnpackResult = {
  unpackId: string
  packVariantId: string
  unitVariantId: string
  packs: number
  units: number
  /** Coût d'un conditionnement sorti (CMP du dépôt). */
  packUnitCost: number
  /** Coût d'une unité entrée = coût du conditionnement / unités par conditionnement. */
  unitCost: number
}

/**
 * Ouvre N conditionnements (casiers, packs…) : sortie de N conditionnements et
 * entrée de N × units_per_case unités, dans la transaction de l'appelant.
 * - mouvements de stock typés 'unpack', référencés sur la ligne stock_unpacks ;
 * - les unités entrent au coût du conditionnement / units_per_case : la valeur
 *   du stock du dépôt est conservée (au centime de coût près, 4 décimales) ;
 * - le lot et la date de péremption du conditionnement suivent les unités ;
 * - verrous : CMP des deux variantes (ordre déterministe) puis lignes de stock.
 */
export async function unpackStock(
  tx: Tx,
  ctx: {
    companyId: string
    depotId: string
    packVariantId: string
    packs: number
    userId?: string | null
    notes?: string | null
    source?: 'manual' | 'pos'
    posOrderId?: string | null
  }
): Promise<UnpackResult> {
  assertPositiveInt(ctx.packs)
  const link = await getUnpackLink(tx, ctx.companyId, ctx.packVariantId)
  await lockStockCosts(tx, ctx.depotId, [link.packVariantId, link.unitVariantId])

  const units = ctx.packs * link.unitsPerPack
  const [unpack] = await tx.sql<{ id: string }>`
    INSERT INTO stock_unpacks (
      company_id, depot_id, pack_variant_id, unit_variant_id, packs, units, source, pos_order_id, notes, created_by
    ) VALUES (
      ${ctx.companyId}, ${ctx.depotId}, ${link.packVariantId}, ${link.unitVariantId}, ${ctx.packs}, ${units},
      ${ctx.source ?? 'manual'}, ${ctx.posOrderId ?? null}, ${ctx.notes ?? null}, ${ctx.userId ?? null}
    )
    RETURNING id
  `
  const notes = ctx.notes?.trim() || `Ouverture de ${ctx.packs} × ${link.label}`
  const common = {
    companyId: ctx.companyId,
    depotId: ctx.depotId,
    movementType: 'unpack' as const,
    referenceType: 'stock_unpack',
    referenceId: unpack.id,
    userId: ctx.userId ?? null,
    notes,
  }

  const lots = await removeStock(tx, {
    ...common,
    variantId: link.packVariantId,
    quantity: ctx.packs,
    label: link.label,
  })

  let packValue = 0
  for (const lot of lots) {
    packValue += lot.quantity * lot.unitCost
    const [source] = await tx.sql<{ expiry_date: string | null }>`
      SELECT expiry_date FROM stock
      WHERE depot_id = ${ctx.depotId} AND product_variant_id = ${link.packVariantId}
        AND COALESCE(lot_number, '') = ${lot.lotNumber ?? ''}
      LIMIT 1
    `
    await addStock(tx, {
      ...common,
      variantId: link.unitVariantId,
      quantity: lot.quantity * link.unitsPerPack,
      lotNumber: lot.lotNumber,
      expiryDate: source?.expiry_date ?? null,
      unitCost: lot.unitCost / link.unitsPerPack,
    })
  }

  const packUnitCost = roundCost(packValue / ctx.packs)
  const unitCost = roundCost(packUnitCost / link.unitsPerPack)
  await tx.sql`
    UPDATE stock_unpacks SET pack_unit_cost = ${packUnitCost}, unit_cost = ${unitCost} WHERE id = ${unpack.id}
  `
  return {
    unpackId: unpack.id,
    packVariantId: link.packVariantId,
    unitVariantId: link.unitVariantId,
    packs: ctx.packs,
    units,
    packUnitCost,
    unitCost,
  }
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
