import { sql } from './db'
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

export class DuplicateSkuError extends Error {
  constructor(public sku: string) {
    super('Un produit avec ce SKU existe déjà')
    this.name = 'DuplicateSkuError'
  }
}

/**
 * Crée un produit + emballage + variante par défaut.
 * Même logique que POST /api/products — ne pas diverger.
 */
export async function createProductForCompany(
  companyId: string,
  data: CreateProductInput
) {
  if (data.sku) {
    const existing = await sql`
      SELECT id FROM products
      WHERE company_id = ${companyId} AND sku = ${data.sku} AND is_active = true
    `
    if (existing.length > 0) {
      throw new DuplicateSkuError(data.sku)
    }
  }

  const products = await sql`
    INSERT INTO products (
      company_id, name, sku, category, brand, description,
      base_unit, purchase_price, selling_price, image_url
    ) VALUES (
      ${companyId}, ${data.name}, ${data.sku || null},
      ${data.category || null}, ${data.brand || null},
      ${data.description || null}, ${data.baseUnit},
      ${data.purchasePrice}, ${data.sellingPrice},
      ${data.imageUrl || null}
    )
    RETURNING *
  `

  const productId = products[0].id as string
  const caseUnits = unitsPerCase(data.baseUnit)

  const packagingName =
    `Emballage - ${data.name} ${data.baseUnit === 'bouteille' ? '' : data.baseUnit}`.trim()

  const packagingTypes = await sql`
    INSERT INTO packaging_types (
      company_id, name, units_per_case, is_returnable, deposit_price
    ) VALUES (
      ${companyId}, ${packagingName}, ${caseUnits}, true, 0
    )
    RETURNING id
  `
  const newPackagingTypeId = packagingTypes[0].id as string

  const depots = await sql`SELECT id FROM depots WHERE company_id = ${companyId}`
  if (depots.length > 0) {
    for (const depot of depots) {
      await sql`
        INSERT INTO packaging_stock (depot_id, packaging_type_id, quantity)
        VALUES (${depot.id}, ${newPackagingTypeId}, 0)
      `
    }
  }

  if (data.variants && data.variants.length > 0) {
    for (const variant of data.variants) {
      await sql`
        INSERT INTO product_variants(
          product_id, packaging_type_id, barcode, price, cost_price
        ) VALUES(
          ${productId}, ${variant.packagingTypeId},
          ${variant.barcode || null}, ${variant.price},
          ${variant.costPrice || null}
        )
      `
    }
  } else {
    await sql`
      INSERT INTO product_variants(
        product_id, packaging_type_id, barcode, price, cost_price
      ) VALUES(
        ${productId}, ${newPackagingTypeId},
        NULL, ${data.sellingPrice}, ${data.purchasePrice}
      )
    `
  }

  return products[0]
}
