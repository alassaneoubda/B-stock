import type { QueryResultRow } from 'pg'
import { withTransaction, type Tx } from './db'
import { AppError } from './errors'
import { assertOwned } from './tenant'
import { unitsPerCase } from './catalog/beverage-catalog'

export type CreateProductInput = {
  name: string
  sku?: string | null
  category?: string | null
  brand?: string | null
  description?: string | null
  baseUnit: string
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

  const packagingName = `Emballage - ${data.name} ${data.baseUnit === 'bouteille' ? '' : data.baseUnit}`
    .trim()
    .slice(0, PACKAGING_NAME_MAX)

  const [packagingType] = await tx.sql`
    INSERT INTO packaging_types (
      company_id, name, units_per_case, is_returnable, deposit_price
    ) VALUES (
      ${companyId}, ${packagingName}, ${unitsPerCase(data.baseUnit)}, true, 0
    )
    RETURNING id
  `
  const newPackagingTypeId = packagingType.id as string

  await tx.sql`
    INSERT INTO packaging_stock (depot_id, packaging_type_id, quantity)
    SELECT d.id, ${newPackagingTypeId}::uuid, 0
    FROM depots d
    WHERE d.company_id = ${companyId}
    ON CONFLICT (depot_id, packaging_type_id) DO NOTHING
  `

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
