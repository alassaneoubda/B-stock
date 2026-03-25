import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/pricing — List price rules and promotions
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId

    const priceRules = await sql`
      SELECT pr.*,
        p.name as product_name,
        pt.name as packaging_name
      FROM price_rules pr
      LEFT JOIN product_variants pv ON pr.product_variant_id = pv.id
      LEFT JOIN products p ON pv.product_id = p.id
      LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
      WHERE pr.company_id = ${companyId}
      ORDER BY pr.client_type, p.name
    `

    const promotions = await sql`
      SELECT pm.*,
        p.name as product_name,
        pt.name as packaging_name
      FROM promotions pm
      LEFT JOIN product_variants pv ON pm.product_variant_id = pv.id
      LEFT JOIN products p ON pv.product_id = p.id
      LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
      WHERE pm.company_id = ${companyId}
      ORDER BY pm.is_active DESC, pm.created_at DESC
    `

    return NextResponse.json({ success: true, data: { priceRules, promotions } })
  } catch (error) {
    console.error('Pricing error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST /api/pricing — Create a price rule or promotion
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const body = await request.json()
    const { type } = body // 'price_rule' or 'promotion'

    if (type === 'promotion') {
      const { name, description, discount_type, discount_value, applies_to, product_variant_id, category, client_type, min_quantity, min_order_amount, valid_from, valid_until } = body

      if (!name || !discount_type || !discount_value) {
        return NextResponse.json({ error: 'Nom, type et valeur de remise requis' }, { status: 400 })
      }

      const result = await sql`
        INSERT INTO promotions (company_id, name, description, discount_type, discount_value, applies_to, product_variant_id, category, client_type, min_quantity, min_order_amount, valid_from, valid_until)
        VALUES (${companyId}, ${name}, ${description || null}, ${discount_type}, ${discount_value}, ${applies_to || 'product'}, ${product_variant_id || null}, ${category || null}, ${client_type || null}, ${min_quantity || 1}, ${min_order_amount || null}, ${valid_from || null}, ${valid_until || null})
        RETURNING *
      `
      return NextResponse.json({ success: true, data: result[0] })
    }

    // Default: price rule
    const { product_variant_id, client_type, price, min_quantity, valid_from, valid_until } = body

    if (!product_variant_id || !client_type || !price) {
      return NextResponse.json({ error: 'Produit, catégorie client et prix requis' }, { status: 400 })
    }

    // Upsert: update if exists for same variant+client_type
    const existing = await sql`
      SELECT id FROM price_rules
      WHERE company_id = ${companyId} AND product_variant_id = ${product_variant_id} AND client_type = ${client_type}
    `

    let result
    if (existing.length > 0) {
      result = await sql`
        UPDATE price_rules SET
          price = ${price},
          min_quantity = ${min_quantity || 1},
          valid_from = ${valid_from || null},
          valid_until = ${valid_until || null},
          updated_at = NOW()
        WHERE id = ${existing[0].id}
        RETURNING *
      `
    } else {
      result = await sql`
        INSERT INTO price_rules (company_id, product_variant_id, client_type, price, min_quantity, valid_from, valid_until)
        VALUES (${companyId}, ${product_variant_id}, ${client_type}, ${price}, ${min_quantity || 1}, ${valid_from || null}, ${valid_until || null})
        RETURNING *
      `
    }

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    console.error('Create pricing error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
