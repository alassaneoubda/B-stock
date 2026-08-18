import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { createProductForCompany, DuplicateSkuError } from '@/lib/products'

const productSchema = z.object({
  name: z.string().min(1, 'Nom du produit requis'),
  sku: z.string().optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  description: z.string().optional(),
  baseUnit: z.string().default('casier'),
  purchasePrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0).default(0),
  imageUrl: z.string().optional(),
  variants: z.array(
    z.object({
      packagingTypeId: z.string().uuid(),
      barcode: z.string().optional(),
      price: z.number().min(0),
      costPrice: z.number().min(0).optional(),
    })
  ).optional(),
})

// POST /api/products — Create a new product
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('products.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const body = await request.json()
    const data = productSchema.parse(body)

    const product = await createProductForCompany(companyId, {
      name: data.name,
      sku: data.sku,
      category: data.category,
      brand: data.brand,
      description: data.description,
      baseUnit: data.baseUnit,
      purchasePrice: data.purchasePrice,
      sellingPrice: data.sellingPrice,
      imageUrl: data.imageUrl,
      variants: data.variants,
    })

    return NextResponse.json({
      success: true,
      data: product,
      message: 'Produit créé avec succès',
    }, { status: 201 })
  } catch (error) {
    if (error instanceof DuplicateSkuError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      )
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      )
    }
    console.error('Error creating product:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création du produit' },
      { status: 500 }
    )
  }
}

// GET /api/products — List products with variants
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('products.read')
    if (!authz.ok) return authz.response
    const { session } = authz

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const search = searchParams.get('search')
    const withVariants = searchParams.get('withVariants') !== 'false'

    let products

    if (category) {
      products = await sql`
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
        ) FILTER(WHERE pv.id IS NOT NULL), '[]'
      ) as variants
        FROM products p
        LEFT JOIN product_variants pv ON p.id = pv.product_id
        LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
        WHERE p.company_id = ${session.user.companyId}
          AND p.is_active = true
          AND p.category = ${category}
        GROUP BY p.id
        ORDER BY p.name
      `
    } else {
      products = await sql`
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
        ) FILTER(WHERE pv.id IS NOT NULL), '[]'
      ) as variants
        FROM products p
        LEFT JOIN product_variants pv ON p.id = pv.product_id
        LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
        WHERE p.company_id = ${session.user.companyId}
          AND p.is_active = true
        GROUP BY p.id
        ORDER BY p.name
      `
    }

    // Filter by search in JS
    let filtered = products as Array<Record<string, unknown>>
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          String(p.name).toLowerCase().includes(q) ||
          String(p.sku || '').toLowerCase().includes(q) ||
          String(p.brand || '').toLowerCase().includes(q)
      )
    }

    return NextResponse.json({ success: true, data: filtered })
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des produits' },
      { status: 500 }
    )
  }
}
