import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction, type Tx } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
import { money } from '@/lib/domain/payments'

// GET /api/pricing — List price rules and promotions
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('pricing.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '500', 10) || 500, 1), 500)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

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
      LIMIT ${limit} OFFSET ${offset}
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
      LIMIT ${limit} OFFSET ${offset}
    `

    return NextResponse.json({ success: true, data: { priceRules, promotions } })
  } catch (error) {
    return handleRouteError(error, 'pricing.list')
  }
}

const optionalUuid = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().uuid().optional()
)
const optionalDate = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ)').optional()
)

const promotionSchema = z
  .object({
    type: z.literal('promotion'),
    name: z.string().trim().min(1, 'Nom requis').max(200),
    description: z.string().max(2000).optional().nullable(),
    discount_type: z.enum(['percentage', 'fixed_amount']),
    discount_value: z.coerce.number().positive('Valeur de remise invalide'),
    applies_to: z.enum(['all', 'category', 'product']).optional().default('product'),
    product_variant_id: optionalUuid,
    category: z.string().max(100).optional().nullable(),
    client_type: z.string().max(50).optional().nullable(),
    min_quantity: z.coerce.number().int().min(1).optional().default(1),
    min_order_amount: z.coerce.number().nonnegative().optional().nullable(),
    is_active: z.boolean().optional().default(true),
    valid_from: optionalDate,
    valid_until: optionalDate,
  })
  .refine((d) => d.discount_type !== 'percentage' || d.discount_value <= 100, {
    message: 'Un pourcentage de remise ne peut pas dépasser 100',
    path: ['discount_value'],
  })

const priceRuleSchema = z.object({
  type: z.literal('price_rule').optional(),
  product_variant_id: z.string().uuid('Produit requis'),
  client_type: z.string().trim().min(1, 'Catégorie client requise').max(50),
  price: z.coerce.number().positive('Prix invalide'),
  min_quantity: z.coerce.number().int().min(1).optional().default(1),
  valid_from: optionalDate,
  valid_until: optionalDate,
})

/**
 * L'écran Tarification envoie l'id du PRODUIT dans product_variant_id.
 * Variante de l'entreprise → telle quelle ; produit de l'entreprise → sa
 * première variante (compatibilité temporaire) ; sinon 404.
 */
async function resolveVariant(tx: Tx, companyId: string, id: string): Promise<string> {
  const [variant] = await tx.sql`
    SELECT pv.id FROM product_variants pv JOIN products p ON p.id = pv.product_id
    WHERE p.company_id = ${companyId} AND pv.id = ${id}
  `
  if (variant) return variant.id
  const [first] = await tx.sql`
    SELECT pv.id FROM products p JOIN product_variants pv ON pv.product_id = p.id
    WHERE p.company_id = ${companyId} AND p.id = ${id}
    ORDER BY pv.created_at ASC, pv.id ASC
    LIMIT 1
  `
  if (!first) throw new AppError(404, 'Produit introuvable', 'NOT_FOUND')
  return first.id
}

// POST /api/pricing — Create a price rule or promotion
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('pricing.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const body = await request.json()

    if (body?.type === 'promotion') {
      const d = promotionSchema.parse(body)
      if (d.applies_to === 'product' && !d.product_variant_id) {
        throw new AppError(400, 'Produit requis pour une promotion « produit spécifique »', 'BAD_REQUEST')
      }
      const promotion = await withTransaction(async (tx) => {
        const variantId = d.product_variant_id ? await resolveVariant(tx, companyId, d.product_variant_id) : null
        const [row] = await tx.sql`
          INSERT INTO promotions (
            company_id, name, description, discount_type, discount_value, applies_to,
            product_variant_id, category, client_type, min_quantity, min_order_amount,
            is_active, valid_from, valid_until
          )
          VALUES (
            ${companyId}, ${d.name}, ${d.description || null}, ${d.discount_type}, ${money(d.discount_value)},
            ${d.applies_to}, ${variantId}, ${d.category || null}, ${d.client_type || null}, ${d.min_quantity},
            ${d.min_order_amount != null ? money(d.min_order_amount) : null}, ${d.is_active},
            ${d.valid_from ?? null}, ${d.valid_until ?? null}
          )
          RETURNING *
        `
        return row
      })
      return NextResponse.json({ success: true, data: promotion })
    }

    // Default: price rule (upsert sur l'index unique variante + catégorie + quantité minimale)
    const d = priceRuleSchema.parse(body)
    const rule = await withTransaction(async (tx) => {
      const variantId = await resolveVariant(tx, companyId, d.product_variant_id)
      const [row] = await tx.sql`
        INSERT INTO price_rules (company_id, product_variant_id, client_type, price, min_quantity, valid_from, valid_until)
        VALUES (
          ${companyId}, ${variantId}, ${d.client_type}, ${money(d.price)}, ${d.min_quantity},
          ${d.valid_from ?? null}, ${d.valid_until ?? null}
        )
        ON CONFLICT (company_id, product_variant_id, client_type, min_quantity)
        DO UPDATE SET
          price = EXCLUDED.price,
          valid_from = EXCLUDED.valid_from,
          valid_until = EXCLUDED.valid_until,
          is_active = true,
          updated_at = NOW()
        RETURNING *
      `
      return row
    })

    return NextResponse.json({ success: true, data: rule })
  } catch (error) {
    return handleRouteError(error, 'pricing.create')
  }
}
