import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { withTransaction } from '@/lib/db'
import { badRequest, conflict, handleRouteError } from '@/lib/errors'
import {
  BEVERAGE_CATALOG,
  CONTENT_UNITS,
  MAX_UNITS_PER_PACK,
  MIN_UNITS_PER_PACK,
  PACK_KINDS,
  getCatalogProduct,
} from '@/lib/catalog/beverage-catalog'
import { loadCatalogProduct } from '@/lib/products'

const variationSchema = z.object({
  // null : format ajouté par le dépôt (absent du catalogue)
  sku: z.string().min(1).max(100).nullable(),
  volume: z.string().trim().max(40),
  packKind: z.enum(PACK_KINDS),
  unitsPerPack: z.number().int().min(MIN_UNITS_PER_PACK).max(MAX_UNITS_PER_PACK),
  contentUnit: z.enum(CONTENT_UNITS),
  // Prix d'UN conditionnement (un casier, un pack…)
  purchasePrice: z.number().min(0),
  sellingPrice: z.number().min(0),
})

const loadSchema = z.object({
  items: z
    .array(
      z.object({
        key: z.string().min(1).max(100),
        name: z.string().trim().min(1).max(255),
        brand: z.string().trim().min(1).max(100),
        category: z.string().trim().min(1).max(100),
        variations: z.array(variationSchema).min(1).max(20),
      })
    )
    .min(1, 'Cochez au moins un format')
    .max(BEVERAGE_CATALOG.length),
})

export async function GET() {
  try {
    const authz = await requirePermission('products.read')
    if (!authz.ok) return authz.response

    return NextResponse.json({ success: true, data: BEVERAGE_CATALOG })
  } catch (error) {
    return handleRouteError(error, 'products.catalog.get')
  }
}

export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('products.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { items } = loadSchema.parse(await request.json())

    for (const item of items) {
      const product = getCatalogProduct(item.key)
      if (!product) throw badRequest(`Produit inconnu dans le catalogue : ${item.key}`)
      const knownSkus = new Set(product.variations.map((v) => v.sku))
      for (const variation of item.variations) {
        if (variation.sku && !knownSkus.has(variation.sku)) {
          throw badRequest(`Format inconnu pour ${product.name} : ${variation.sku}`)
        }
      }
    }

    // Tout le lot dans une seule transaction : soit tous les formats retenus
    // sont créés, soit aucun. Les formats déjà présents sont ignorés.
    const { created, skipped } = await withTransaction(async (tx) => {
      const created: string[] = []
      const skipped: string[] = []
      for (const item of items) {
        const result = await loadCatalogProduct(tx, companyId, item)
        created.push(...result.created)
        skipped.push(...result.skipped)
      }
      return { created, skipped }
    })

    if (created.length === 0) {
      const err = conflict('Aucun format ajouté. Ils existent déjà dans votre catalogue.')
      return NextResponse.json({ error: err.message, code: err.code, skipped }, { status: 409 })
    }

    return NextResponse.json({
      success: true,
      created: created.length,
      skipped,
      message: `${created.length} format${created.length > 1 ? 's' : ''} chargé${created.length > 1 ? 's' : ''}`,
    })
  } catch (error) {
    return handleRouteError(error, 'products.catalog.load')
  }
}
