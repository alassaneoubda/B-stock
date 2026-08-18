import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { BEVERAGE_CATALOG, getCatalogItem } from '@/lib/catalog/beverage-catalog'
import { createProductForCompany, DuplicateSkuError } from '@/lib/products'

const loadSchema = z.object({
  items: z
    .array(
      z.object({
        sku: z.string().min(1),
        name: z.string().min(1),
        brand: z.string().min(1),
        category: z.string().min(1),
        baseUnit: z.string().min(1),
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

    return NextResponse.json({
      success: true,
      data: BEVERAGE_CATALOG,
    })
  } catch (error) {
    console.error('Catalog GET error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('products.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const body = await request.json()
    const { items } = loadSchema.parse(body)

    const created: string[] = []
    const skipped: string[] = []

    for (const item of items) {
      const catalog = getCatalogItem(item.sku)
      if (!catalog) {
        return NextResponse.json(
          { error: `SKU inconnu dans le catalogue : ${item.sku}` },
          { status: 400 }
        )
      }

      try {
        await createProductForCompany(companyId, {
          name: item.name.trim(),
          sku: item.sku,
          brand: item.brand.trim(),
          category: item.category.trim(),
          baseUnit: item.baseUnit.trim(),
          purchasePrice: item.purchasePrice,
          sellingPrice: item.sellingPrice,
        })
        created.push(item.sku)
      } catch (error) {
        if (error instanceof DuplicateSkuError) {
          skipped.push(item.sku)
          continue
        }
        throw error
      }
    }

    if (created.length === 0) {
      return NextResponse.json(
        {
          error: 'Aucun produit créé. Ces références existent déjà dans votre catalogue.',
          skipped,
        },
        { status: 409 }
      )
    }

    return NextResponse.json({
      success: true,
      created: created.length,
      skipped,
      message: `${created.length} produit${created.length > 1 ? 's' : ''} chargé${created.length > 1 ? 's' : ''}`,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      )
    }
    console.error('Catalog POST error:', error)
    return NextResponse.json(
      { error: 'Erreur lors du chargement des produits' },
      { status: 500 }
    )
  }
}
