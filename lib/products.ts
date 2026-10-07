import type { QueryResultRow } from 'pg'
import { withTransaction, type Tx } from './db'
import { AppError } from './errors'
import { assertOwned } from './tenant'
import {
  isReturnablePack,
  packagingDescription,
  packagingLabel,
  unitsPerCase,
} from './catalog/beverage-catalog'

export type CreateProductInput = {
  name: string
  sku?: string | null
  category?: string | null
  brand?: string | null
  description?: string | null
  /** Conditionnement dans lequel le stock est compté (casier, pack, carton…). */
  baseUnit: string
  /** Unités contenues dans un conditionnement (ex. 12 bouteilles par casier). */
  unitsPerPack?: number | null
  purchasePrice: number
  sellingPrice: number
  imageUrl?: string | null
  variants?: Array<{
    packagingTypeId: string
    barcode?: string
    price: number
    costPrice?: number
  }>
}

/** SKU déjà utilisé par un produit actif de l'entreprise (→ 409). */
export class DuplicateSkuError extends AppError {
  constructor(public sku: string) {
    super(409, 'Un produit avec ce SKU existe déjà', 'DUPLICATE_SKU')
    this.name = 'DuplicateSkuError'
  }
}

/** Longueur max de packaging_types.name. */
const PACKAGING_NAME_MAX = 100

/**
 * Crée un produit + emballage dédié + stock d'emballage à 0 dans chaque dépôt
 * + variantes (celles fournies, sinon une variante par défaut).
 * Utilisé par POST /api/products et POST /api/products/catalog — ne pas diverger.
 *
 * Tout est fait dans UNE transaction (celle fournie via `tx`, sinon une
 * nouvelle). L'unicité du SKU est garantie par un verrou consultatif pris
 * sur (entreprise, SKU) : deux créations simultanées du même SKU sont
 * sérialisées et la seconde reçoit une DuplicateSkuError.
 *
 * La DuplicateSkuError est levée AVANT toute écriture : l'appelant peut
 * l'intercepter et poursuivre la même transaction (cas du chargement de catalogue).
 */
export async function createProductForCompany(
  companyId: string,
  data: CreateProductInput,
  tx?: Tx
): Promise<QueryResultRow> {
  if (!tx) {
    return withTransaction((t) => createProductForCompany(companyId, data, t))
  }

  const sku = data.sku?.trim() || null

  if (sku) {
    await tx.sql`SELECT pg_advisory_xact_lock(hashtext(${`${companyId}:product-sku:${sku}`}))`
    const existing = await tx.sql`
      SELECT id FROM products
      WHERE company_id = ${companyId} AND sku = ${sku} AND is_active = true
      LIMIT 1
    `
    if (existing.length > 0) {
      throw new DuplicateSkuError(sku)
    }
  }

  const variants = data.variants ?? []
  if (variants.length > 0) {
    await assertOwned(tx.sql, companyId, {
      packagingTypes: variants.map((v) => v.packagingTypeId),
    })
  }

  const [product] = await tx.sql`
    INSERT INTO products (
      company_id, name, sku, category, brand, description,
      base_unit, purchase_price, selling_price, image_url
    ) VALUES (
      ${companyId}, ${data.name}, ${sku},
      ${data.category || null}, ${data.brand || null},
      ${data.description || null}, ${data.baseUnit},
      ${data.purchasePrice}, ${data.sellingPrice},
      ${data.imageUrl || null}
    )
    RETURNING *
  `
  const productId = product.id as string

  // Contenu explicite (ex. casier de 12) : l'emballage porte ce libellé ; sinon ancien nommage
  const explicitUnits = data.unitsPerPack && data.unitsPerPack > 0 ? Math.floor(data.unitsPerPack) : null
  const packKind = data.baseUnit.charAt(0).toUpperCase() + data.baseUnit.slice(1)
  const newPackagingTypeId = await createPackaging(tx, companyId, explicitUnits
    ? {
        name: packagingLabel({ volume: '', packKind, unitsPerPack: explicitUnits }),
        description: null,
        unitsPerPack: explicitUnits,
        returnable: true,
      }
    : {
        name: `Emballage - ${data.name} ${data.baseUnit === 'bouteille' ? '' : data.baseUnit}`.trim(),
        description: null,
        unitsPerPack: unitsPerCase(data.baseUnit),
        returnable: true,
      })

  if (variants.length > 0) {
    for (const variant of variants) {
      await tx.sql`
        INSERT INTO product_variants (
          product_id, packaging_type_id, barcode, price, cost_price
        ) VALUES (
          ${productId}, ${variant.packagingTypeId},
          ${variant.barcode || null}, ${variant.price},
          ${variant.costPrice ?? null}
        )
      `
    }
  } else {
    await tx.sql`
      INSERT INTO product_variants (
        product_id, packaging_type_id, barcode, price, cost_price
      ) VALUES (
        ${productId}, ${newPackagingTypeId},
        NULL, ${data.sellingPrice}, ${data.purchasePrice}
      )
    `
  }

  return product
}

/**
 * Crée l'emballage d'une variante (porte le nombre d'unités par conditionnement
 * et la consigne) + son stock d'emballage à 0 dans chaque dépôt.
 */
async function createPackaging(
  tx: Tx,
  companyId: string,
  p: { name: string; description: string | null; unitsPerPack: number; returnable: boolean }
): Promise<string> {
  const [packagingType] = await tx.sql`
    INSERT INTO packaging_types (
      company_id, name, description, units_per_case, is_returnable, deposit_price
    ) VALUES (
      ${companyId}, ${p.name.slice(0, PACKAGING_NAME_MAX)}, ${p.description},
      ${p.unitsPerPack}, ${p.returnable}, 0
    )
    RETURNING id
  `
  const id = packagingType.id as string
  await tx.sql`
    INSERT INTO packaging_stock (depot_id, packaging_type_id, quantity)
    SELECT d.id, ${id}::uuid, 0
    FROM depots d
    WHERE d.company_id = ${companyId}
    ON CONFLICT (depot_id, packaging_type_id) DO NOTHING
  `
  return id
}

export type CatalogLoadVariation = {
  /** Référence catalogue ; null pour un format ajouté par le dépôt. */
  sku: string | null
  volume: string
  packKind: string
  unitsPerPack: number
  contentUnit: string
  /** Prix d'un conditionnement (un casier, un pack…). */
  purchasePrice: number
  sellingPrice: number
}

export type CatalogLoadProduct = {
  key: string
  name: string
  brand: string
  category: string
  variations: CatalogLoadVariation[]
}

/**
 * Charge un produit du catalogue avec ses formats : un produit (ex. « Bock »),
 * une variante par format (66 cl en casier de 12, 100 cl en casier de 6…).
 * Le stock et les prix sont comptés par conditionnement.
 *
 * Rejouable : si le produit existe déjà (même référence), seuls les formats
 * manquants lui sont ajoutés ; ceux déjà présents sont ignorés.
 */
export async function loadCatalogProduct(
  tx: Tx,
  companyId: string,
  item: CatalogLoadProduct
): Promise<{ productId: string; created: string[]; skipped: string[] }> {
  await tx.sql`SELECT pg_advisory_xact_lock(hashtext(${`${companyId}:product-sku:${item.key}`}))`

  const first = item.variations[0]
  const [existing] = await tx.sql`
    SELECT id FROM products
    WHERE company_id = ${companyId} AND sku = ${item.key} AND is_active = true
    LIMIT 1
  `
  let productId = existing?.id as string | undefined
  if (!productId) {
    const [product] = await tx.sql`
      INSERT INTO products (
        company_id, name, sku, category, brand, base_unit, purchase_price, selling_price
      ) VALUES (
        ${companyId}, ${item.name}, ${item.key}, ${item.category}, ${item.brand},
        ${first.packKind.toLowerCase()}, ${first.purchasePrice}, ${first.sellingPrice}
      )
      RETURNING id
    `
    productId = product.id as string
  }

  // Formats déjà présents : par référence catalogue, sinon par libellé (formats ajoutés à la main)
  const present = await tx.sql`
    SELECT pv.sku, pt.name AS label
    FROM product_variants pv
    LEFT JOIN packaging_types pt ON pt.id = pv.packaging_type_id
    WHERE pv.product_id = ${productId}
  `
  const presentSkus = new Set(present.map((r) => r.sku).filter(Boolean))
  const presentLabels = new Set(present.map((r) => String(r.label ?? '').toLowerCase()))

  const created: string[] = []
  const skipped: string[] = []
  for (const variation of item.variations) {
    const label = packagingLabel(variation)
    if ((variation.sku && presentSkus.has(variation.sku)) || presentLabels.has(label.toLowerCase())) {
      skipped.push(`${item.name} ${label}`)
      continue
    }
    const packagingTypeId = await createPackaging(tx, companyId, {
      name: label,
      description: packagingDescription(variation),
      unitsPerPack: variation.unitsPerPack,
      returnable: isReturnablePack(variation.packKind),
    })
    await tx.sql`
      INSERT INTO product_variants (product_id, packaging_type_id, sku, price, cost_price)
      VALUES (
        ${productId}, ${packagingTypeId}, ${variation.sku},
        ${variation.sellingPrice}, ${variation.purchasePrice}
      )
    `
    presentLabels.add(label.toLowerCase())
    if (variation.sku) presentSkus.add(variation.sku)
    created.push(`${item.name} ${label}`)
  }

  return { productId, created, skipped }
}

// ---------------------------------------------------------------------------
// Vente à l'unité (déconditionnement)
// ---------------------------------------------------------------------------

export type UnitVariantInput = {
  /** Variante conditionnement (casier, pack, carton) à ouvrir. */
  packVariantId: string
  /** Prix de vente d'une unité (bouteille, canette). */
  price: number
  /**
   * Emballage unité consigné (bouteille en verre) ou perdu (canette, plastique).
   * Par défaut : comme le conditionnement — un casier est consigné (verre),
   * un pack ou un carton ne l'est pas.
   */
  returnable?: boolean
  /** Consigne d'une bouteille (0 par défaut, modifiable dans Emballages). */
  depositPrice?: number
  /** Lier une variante unité déjà existante du même produit au lieu d'en créer une. */
  existingVariantId?: string | null
}

const UNIT_NAMES: Record<string, string> = {
  bouteilles: 'Bouteille',
  canettes: 'Canette',
  briques: 'Brique',
}

/** « 66 cl · Casier de 12 » + « Casier de 12 bouteilles de 66 cl » → { volume: '66 cl', unitName: 'Bouteille' }. */
export function unitNaming(packagingName: string | null, packagingDescription: string | null) {
  const name = packagingName ?? ''
  const volume = name.includes(' · ') ? name.split(' · ')[0].trim() : ''
  const contentUnit = (packagingDescription ?? '').toLowerCase().match(/(bouteilles|canettes|briques)/)?.[1]
  const unitName = (contentUnit && UNIT_NAMES[contentUnit]) || 'Bouteille'
  return { volume, unitName }
}

/**
 * Active la vente à l'unité d'un conditionnement : crée (ou relie) la variante
 * « unité » du même produit et la lie au conditionnement (unit_variant_id).
 * - emballage unité : 1 unité, consigné ou non selon `returnable` ;
 * - prix d'achat indicatif = prix d'achat du conditionnement / unités ;
 * - le stock des unités naît uniquement de l'ouverture de casiers (unpackStock).
 */
export async function createUnitVariant(
  tx: Tx,
  companyId: string,
  input: UnitVariantInput
): Promise<{ unitVariantId: string; created: boolean }> {
  const [pack] = await tx.sql`
    SELECT pv.id, pv.product_id, pv.sku, pv.cost_price, pv.unit_variant_id,
           pt.name AS packaging_name, pt.description AS packaging_description,
           pt.units_per_case, pt.is_returnable
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN packaging_types pt ON pt.id = pv.packaging_type_id
    WHERE pv.id = ${input.packVariantId} AND p.company_id = ${companyId}
    FOR UPDATE OF pv
  `
  if (!pack) throw new AppError(404, 'Variante introuvable', 'NOT_FOUND')
  const unitsPerPack = Number(pack.units_per_case ?? 1)
  if (unitsPerPack <= 1) {
    throw new AppError(409, 'Ce format ne contient qu’une unité : il ne peut pas être vendu au détail', 'NOT_A_PACK')
  }
  if (pack.unit_variant_id) {
    throw new AppError(409, 'La vente à l’unité est déjà activée pour ce format', 'UNIT_VARIANT_EXISTS')
  }

  let unitVariantId: string
  let created = false
  if (input.existingVariantId) {
    const [existing] = await tx.sql`
      SELECT pv.id, pt.units_per_case FROM product_variants pv
      LEFT JOIN packaging_types pt ON pt.id = pv.packaging_type_id
      WHERE pv.id = ${input.existingVariantId} AND pv.product_id = ${pack.product_id}
    `
    if (!existing) throw new AppError(404, 'Variante unité introuvable sur ce produit', 'NOT_FOUND')
    if (existing.id === pack.id || Number(existing.units_per_case ?? 1) !== 1) {
      throw new AppError(409, 'La variante choisie doit être un format à l’unité', 'NOT_A_UNIT')
    }
    unitVariantId = existing.id
    await tx.sql`UPDATE product_variants SET price = ${input.price} WHERE id = ${unitVariantId}`
  } else {
    const { volume, unitName } = unitNaming(pack.packaging_name, pack.packaging_description)
    const returnable = input.returnable ?? pack.is_returnable !== false
    const packagingTypeId = await createPackaging(tx, companyId, {
      name: volume ? `${volume} · ${unitName}` : unitName,
      description: `${unitName}${volume ? ` de ${volume}` : ''} à l’unité (${pack.packaging_name ?? 'conditionnement'} ouvert)`,
      unitsPerPack: 1,
      returnable,
    })
    if (input.depositPrice && input.depositPrice > 0) {
      await tx.sql`UPDATE packaging_types SET deposit_price = ${input.depositPrice} WHERE id = ${packagingTypeId}`
    }
    const unitCost = pack.cost_price == null ? null : Math.round((Number(pack.cost_price) / unitsPerPack) * 100) / 100
    const [row] = await tx.sql`
      INSERT INTO product_variants (product_id, packaging_type_id, sku, price, cost_price)
      VALUES (${pack.product_id}, ${packagingTypeId}, ${pack.sku ? `${pack.sku}-U`.slice(0, 100) : null}, ${input.price}, ${unitCost})
      RETURNING id
    `
    unitVariantId = row.id
    created = true
  }

  await tx.sql`UPDATE product_variants SET unit_variant_id = ${unitVariantId} WHERE id = ${pack.id}`
  return { unitVariantId, created }
}
