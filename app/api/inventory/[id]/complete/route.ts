import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// POST /api/inventory/[id]/complete — Finalize inventory and apply adjustments
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const userId = session.user.id
    const inventoryId = params.id
    const body = await request.json()
    const { apply_adjustments } = body

    const sessions = await sql`
      SELECT * FROM inventory_sessions WHERE id = ${inventoryId} AND company_id = ${companyId}
    `
    if (sessions.length === 0) {
      return NextResponse.json({ error: 'Inventaire introuvable' }, { status: 404 })
    }
    if (sessions[0].status !== 'in_progress') {
      return NextResponse.json({ error: 'Inventaire déjà finalisé' }, { status: 400 })
    }

    const inv = sessions[0]

    // Get items with variance
    const items = await sql`
      SELECT * FROM inventory_items
      WHERE inventory_session_id = ${inventoryId} AND counted_quantity IS NOT NULL
    `

    let itemsWithVariance = 0
    let totalVarianceValue = 0

    for (const item of items) {
      const variance = Number(item.counted_quantity) - Number(item.system_quantity)
      if (variance !== 0) {
        itemsWithVariance++
        totalVarianceValue += variance * Number(item.unit_value || 0)

        if (apply_adjustments) {
          // Adjust stock to match counted quantity
          if (item.item_type === 'product' && item.product_variant_id) {
            await sql`
              UPDATE stock SET quantity = ${item.counted_quantity}, updated_at = NOW()
              WHERE depot_id = ${inv.depot_id} AND product_variant_id = ${item.product_variant_id}
            `
            await sql`
              INSERT INTO stock_movements (company_id, depot_id, product_variant_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
              VALUES (${companyId}, ${inv.depot_id}, ${item.product_variant_id}, 'adjustment', ${variance}, 'inventory', ${inventoryId}, ${'Ajustement inventaire ' + inv.session_number}, ${userId})
            `
          }
          if (item.item_type === 'packaging' && item.packaging_type_id) {
            await sql`
              UPDATE packaging_stock SET quantity = ${item.counted_quantity}, updated_at = NOW()
              WHERE depot_id = ${inv.depot_id} AND packaging_type_id = ${item.packaging_type_id}
            `
          }
        }
      }
    }

    await sql`
      UPDATE inventory_sessions SET
        status = 'completed',
        items_with_variance = ${itemsWithVariance},
        total_variance_value = ${totalVarianceValue},
        completed_by = ${userId},
        completed_at = NOW()
      WHERE id = ${inventoryId}
    `

    await sql`
      INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
      VALUES (${companyId}, ${userId}, 'update', 'inventory_session', ${inventoryId},
        ${JSON.stringify({ items_with_variance: itemsWithVariance, total_variance_value: totalVarianceValue, adjustments_applied: !!apply_adjustments })}::jsonb)
    `

    return NextResponse.json({
      success: true,
      data: { items_with_variance: itemsWithVariance, total_variance_value: totalVarianceValue, adjustments_applied: !!apply_adjustments },
    })
  } catch (error) {
    console.error('Complete inventory error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
