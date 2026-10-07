import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { withTransaction } from '@/lib/db'
import { handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { createUnitVariant } from '@/lib/products'

const schema = z.object({
  packVariantId: z.string().uuid(),
  price: z.coerce.number().min(0).max(100_000_000),
  returnable: z.boolean().optional(),
  depositPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  existingVariantId: z.string().uuid().nullish(),
})

/**
 * POST /api/products/[id]/unit-variant — « Vendre aussi à la bouteille ».
 * Crée (ou relie) la variante unité d'un conditionnement du produit.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('products.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { id } = await params
    if (!isUuid(id)) throw notFound('Produit')
    const data = schema.parse(await request.json())

    const result = await withTransaction(async (tx) => {
      const [variant] = await tx.sql`
        SELECT pv.id FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE pv.id = ${data.packVariantId} AND pv.product_id = ${id} AND p.company_id = ${companyId}
      `
      if (!variant) throw notFound('Variante')
      return createUnitVariant(tx, companyId, data)
    })

    return NextResponse.json(
      { success: true, data: result, message: 'Vente à l’unité activée' },
      { status: result.created ? 201 : 200 }
    )
  } catch (error) {
    return handleRouteError(error, 'products.unit-variant')
  }
}
