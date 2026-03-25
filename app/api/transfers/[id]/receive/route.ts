import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// POST /api/transfers/[id]/receive — Receive a depot transfer (deduct source, add destination)
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const userId = session.user.id
    const transferId = params.id
    const body = await request.json()
    const { items } = body // [{ id, quantity_received, quantity_damaged }]

    const transfers = await sql`
      SELECT * FROM depot_transfers WHERE id = ${transferId} AND company_id = ${companyId}
    `
    if (transfers.length === 0) {
      return NextResponse.json({ error: 'Transfert introuvable' }, { status: 404 })
    }

    const transfer = transfers[0]
    if (transfer.status === 'received') {
      return NextResponse.json({ error: 'Transfert déjà réceptionné' }, { status: 400 })
    }

    // Ship if still pending
    if (transfer.status === 'pending') {
      // Deduct from source depot
      const transferItems = await sql`
        SELECT * FROM depot_transfer_items WHERE depot_transfer_id = ${transferId}
      `
      for (const item of transferItems) {
        if (item.product_variant_id) {
          await sql`
            UPDATE stock SET quantity = quantity - ${item.quantity_sent}, updated_at = NOW()
            WHERE depot_id = ${transfer.source_depot_id} AND product_variant_id = ${item.product_variant_id}
          `
          await sql`
            INSERT INTO stock_movements (company_id, depot_id, product_variant_id, movement_type, quantity, reference_type, reference_id, created_by)
            VALUES (${companyId}, ${transfer.source_depot_id}, ${item.product_variant_id}, 'transfer', ${-item.quantity_sent}, 'depot_transfer', ${transferId}, ${userId})
          `
        }
        if (item.packaging_type_id) {
          await sql`
            UPDATE packaging_stock SET quantity = quantity - ${item.quantity_sent}, updated_at = NOW()
            WHERE depot_id = ${transfer.source_depot_id} AND packaging_type_id = ${item.packaging_type_id}
          `
        }
      }
    }

    // Update received quantities
    if (items && items.length > 0) {
      for (const item of items) {
        await sql`
          UPDATE depot_transfer_items SET
            quantity_received = ${item.quantity_received || 0},
            quantity_damaged = ${item.quantity_damaged || 0}
          WHERE id = ${item.id}
        `
      }
    }

    // Add to destination depot
    const finalItems = await sql`
      SELECT * FROM depot_transfer_items WHERE depot_transfer_id = ${transferId}
    `
    for (const item of finalItems) {
      const qtyReceived = Number(item.quantity_received || item.quantity_sent)
      if (item.product_variant_id) {
        // Upsert stock in destination
        const existing = await sql`
          SELECT id FROM stock WHERE depot_id = ${transfer.destination_depot_id} AND product_variant_id = ${item.product_variant_id}
        `
        if (existing.length > 0) {
          await sql`
            UPDATE stock SET quantity = quantity + ${qtyReceived}, updated_at = NOW()
            WHERE depot_id = ${transfer.destination_depot_id} AND product_variant_id = ${item.product_variant_id}
          `
        } else {
          await sql`
            INSERT INTO stock (depot_id, product_variant_id, quantity) VALUES (${transfer.destination_depot_id}, ${item.product_variant_id}, ${qtyReceived})
          `
        }
        await sql`
          INSERT INTO stock_movements (company_id, depot_id, product_variant_id, movement_type, quantity, reference_type, reference_id, created_by)
          VALUES (${companyId}, ${transfer.destination_depot_id}, ${item.product_variant_id}, 'transfer', ${qtyReceived}, 'depot_transfer', ${transferId}, ${userId})
        `
      }
      if (item.packaging_type_id) {
        const existingPkg = await sql`
          SELECT id FROM packaging_stock WHERE depot_id = ${transfer.destination_depot_id} AND packaging_type_id = ${item.packaging_type_id}
        `
        if (existingPkg.length > 0) {
          await sql`
            UPDATE packaging_stock SET quantity = quantity + ${qtyReceived}, updated_at = NOW()
            WHERE depot_id = ${transfer.destination_depot_id} AND packaging_type_id = ${item.packaging_type_id}
          `
        } else {
          await sql`
            INSERT INTO packaging_stock (depot_id, packaging_type_id, quantity) VALUES (${transfer.destination_depot_id}, ${item.packaging_type_id}, ${qtyReceived})
          `
        }
      }
    }

    await sql`
      UPDATE depot_transfers SET status = 'received', received_by = ${userId}, received_at = NOW(), updated_at = NOW()
      WHERE id = ${transferId}
    `

    return NextResponse.json({ success: true, message: 'Transfert réceptionné' })
  } catch (error) {
    console.error('Receive transfer error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
