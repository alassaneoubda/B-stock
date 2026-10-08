import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { createProductForCompany } from '@/lib/products'

const productSchema = z.object({
  name: z.string().trim().min(1, 'Nom du produit requis').max(255),
  sku: z.string().trim().max(100).optional(),
  category: z.string().max(100).optional(),
  brand: z.string().max(100).optional(),
  description: z.string().max(5000).optional(),
  baseUnit: z.string().min(1).max(50).default('casier'),
  // Unités par conditionnement (ex. 12 bouteilles par casier) — propre au produit
  unitsPerPack: z.number().int().min(1).max(100).optional(),
  purchasePrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0).default(0),
  imageUrl: z.string().max(2000).optional(),
  /** TVA propre au produit (%) ; null = taux standard de l'entreprise. */
  vatRate: z.number().min(0).max(100).nullable().optional(),
  variants: z
    .array(
      z.object({
        packagingTypeId: z.string().uuid(),
        barcode: z.string().max(100).optional(),
        price: z.number().min(0),
        costPrice: z.number().min(0).optional(),
      })
    )
    .max(50)
    .optional(),
})

/** ?limit (défaut 500 : la liste alimente des listes déroulantes, max 500) / ?offset */
function parsePage(searchParams: URLSearchParams, defaultLimit = 500) {
  const limit = Number.parseInt(searchParams.get('limit') ?? '', 10)
  const offset = Number.parseInt(searchParams.get('offset') ?? '', 10)
  return {
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : defaultLimit,
    offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
  }
}

// POST /api/products — Create a new product
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('products.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const data = productSchema.parse(await request.json())

    // Transaction + contrôle d'appartenance des emballages + verrou SKU dans createProductForCompany
    const product = await createProductForCompany(companyId, {
      name: data.name,
      sku: data.sku,
      category: data.category,
      brand: data.brand,
      description: data.description,
      baseUnit: data.baseUnit,
      unitsPerPack: data.unitsPerPack,
      purchasePrice: data.purchasePrice,
      sellingPrice: data.sellingPrice,
      imageUrl: data.imageUrl,
      vatRate: data.vatRate,
      variants: data.variants,
    })

    return NextResponse.json(
      { success: true, data: product, message: 'Produit créé avec succès' },
      { status: 201 }
    )
  } catch (error) {
    return handleRouteError(error, 'products.create')
  }
}

// GET /api/products — List products with variants
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('products.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || null
    const search = searchParams.get('search')?.trim() || null
    const { limit, offset } = parsePage(searchParams)
    const pattern = search ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null

    const products = await sql`
      SELECT p.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', pv.id,
              'packaging_type_id', pv.packaging_type_id,
              'barcode', pv.barcode,
              'price', pv.price,
              'cost_price', pv.cost_price,
              'packaging_name', pt.name,
              'units_per_case', pt.units_per_case
            )
          ) FILTER (WHERE pv.id IS NOT NULL), '[]'
        ) AS variants
      FROM products p
      LEFT JOIN product_variants pv ON p.id = pv.product_id
      LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
      WHERE p.company_id = ${companyId}
        AND p.is_active = true
        AND (${category}::text IS NULL OR p.category = ${category}::text)
        AND (
          ${pattern}::text IS NULL
          OR p.name ILIKE ${pattern}::text
          OR COALESCE(p.sku, '') ILIKE ${pattern}::text
          OR COALESCE(p.brand, '') ILIKE ${pattern}::text
        )
      GROUP BY p.id
      ORDER BY p.name, p.id
      LIMIT ${limit} OFFSET ${offset}
    `

    return NextResponse.json({ success: true, data: products })
  } catch (error) {
    return handleRouteError(error, 'products.list')
  }
}
