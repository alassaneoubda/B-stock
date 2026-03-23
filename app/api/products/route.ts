import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

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
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = await request.json()
    const data = productSchema.parse(body)
    const { companyId } = session.user

    // Check for duplicate SKU
    if (data.sku) {
      const existing = await sql`
        SELECT id FROM products
        WHERE company_id = ${companyId} AND sku = ${data.sku} AND is_active = true
      `
      if (existing.length > 0) {
        return NextResponse.json(
          { error: 'Un produit avec ce SKU existe déjà' },
          { status: 409 }
        )
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

    const productId = products[0].id

    // Auto-create packaging type corresponding to this product
    const packagingName = `Emballage - ${data.name} ${data.baseUnit === 'bouteille' ? '' : data.baseUnit}`.trim()
    const packagingTypes = await sql`
      INSERT INTO packaging_types (
        company_id, name, units_per_case, is_returnable, deposit_price
      ) VALUES (
        ${companyId}, ${packagingName}, 1, true, 0
      )
      RETURNING id
    `
    const newPackagingTypeId = packagingTypes[0].id

    // Initialize packaging stock for all depots
    const depots = await sql`SELECT id FROM depots WHERE company_id = ${companyId}`
    if (depots.length > 0) {
      for (const depot of depots) {
        await sql`
          INSERT INTO packaging_stock (depot_id, packaging_type_id, quantity)
          VALUES (${depot.id}, ${newPackagingTypeId}, 0)
        `
      }
    }

    // Create variants if provided
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
      // Auto-create default variant using the newly created packaging
      await sql`
        INSERT INTO product_variants(
          product_id, packaging_type_id, barcode, price, cost_price
        ) VALUES(
          ${productId}, ${newPackagingTypeId},
          NULL, ${data.sellingPrice}, ${data.purchasePrice}
        )
      `
    }

    return NextResponse.json({
      success: true,
      data: products[0],
      message: 'Produit créé avec succès',
    }, { status: 201 })
  } catch (error) {
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
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

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
