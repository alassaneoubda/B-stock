import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { withTransaction } from '@/lib/db'
import { badRequest, conflict, handleRouteError } from '@/lib/errors'
import { BEVERAGE_CATALOG, getCatalogItem } from '@/lib/catalog/beverage-catalog'
import { createProductForCompany, DuplicateSkuError } from '@/lib/products'

const loadSchema = z.object({
  items: z
    .array(
      z.object({
        sku: z.string().min(1).max(100),
        name: z.string().trim().min(1).max(255),
        brand: z.string().trim().min(1).max(100),
        category: z.string().trim().min(1).max(100),
        baseUnit: z.string().trim().min(1).max(50),
        purchasePrice: z.number().min(0),
        sellingPrice: z.number().min(0),
      })
    )
    .min(1, 'Cochez au moins un produit')
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
      if (!getCatalogItem(item.sku)) {
        throw badRequest(`SKU inconnu dans le catalogue : ${item.sku}`)
      }
    }

    // Tout le lot dans une seule transaction : soit tous les produits retenus
    // sont créés, soit aucun. Les SKU déjà présents sont ignorés (la
    // DuplicateSkuError est levée avant toute écriture, la transaction reste valide).
    const { created, skipped } = await withTransaction(async (tx) => {
      const created: string[] = []
      const skipped: string[] = []
      for (const item of items) {
        try {
          await createProductForCompany(
            companyId,
            {
              name: item.name,
              sku: item.sku,
              brand: item.brand,
              category: item.category,
              baseUnit: item.baseUnit,
              purchasePrice: item.purchasePrice,
              sellingPrice: item.sellingPrice,
            },
            tx
          )
          created.push(item.sku)
        } catch (error) {
          if (error instanceof DuplicateSkuError) {
            skipped.push(item.sku)
            continue
          }
          throw error
        }
      }
      return { created, skipped }
    })

    if (created.length === 0) {
      const err = conflict('Aucun produit créé. Ces références existent déjà dans votre catalogue.')
      return NextResponse.json({ error: err.message, code: err.code, skipped }, { status: 409 })
    }

    return NextResponse.json({
      success: true,
      created: created.length,
      skipped,
      message: `${created.length} produit${created.length > 1 ? 's' : ''} chargé${created.length > 1 ? 's' : ''}`,
    })
  } catch (error) {
    return handleRouteError(error, 'products.catalog.load')
  }
}
