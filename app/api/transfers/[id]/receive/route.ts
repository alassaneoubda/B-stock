import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { sql, sqlRaw, transaction, type SqlQuery } from '@/lib/db'

// POST /api/transfers/[id]/receive — Receive a depot transfer (deduct source, add destination)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('transfers.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const transferId = (await params).id
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

    // Read all transfer items once
    const transferItems = await sql`
      SELECT * FROM depot_transfer_items WHERE depot_transfer_id = ${transferId}
    `

    // Map received/damaged quantities provided in the body (by item id)
    const bodyMap = new Map<string, { quantity_received?: number; quantity_damaged?: number }>()
    if (items && Array.isArray(items)) {
      for (const it of items) {
        if (it?.id) {
          bodyMap.set(it.id, {
            quantity_received: it.quantity_received,
            quantity_damaged: it.quantity_damaged,
          })
        }
      }
    }

    // Pre-read destination existing stock to decide insert vs update (no read inside the tx)
    const existingDestStock = await sql`
      SELECT product_variant_id FROM stock WHERE depot_id = ${transfer.destination_depot_id}
    `
    const destStockSet = new Set(existingDestStock.map((r: any) => r.product_variant_id))
    const existingDestPkg = await sql`
      SELECT packaging_type_id FROM packaging_stock WHERE depot_id = ${transfer.destination_depot_id}
    `
    const destPkgSet = new Set(existingDestPkg.map((r: any) => r.packaging_type_id))

    const writes: SqlQuery[] = []

    // 1. If still pending, deduct from source depot
    if (transfer.status === 'pending') {
      for (const item of transferItems) {
        if (item.product_variant_id) {
          writes.push(sqlRaw`
            UPDATE stock SET quantity = quantity - ${item.quantity_sent}, updated_at = NOW()
            WHERE depot_id = ${transfer.source_depot_id} AND product_variant_id = ${item.product_variant_id}
          `)
          writes.push(sqlRaw`
            INSERT INTO stock_movements (company_id, depot_id, product_variant_id, movement_type, quantity, reference_type, reference_id, created_by)
            VALUES (${companyId}, ${transfer.source_depot_id}, ${item.product_variant_id}, 'transfer', ${-item.quantity_sent}, 'depot_transfer', ${transferId}, ${userId})
          `)
        }
        if (item.packaging_type_id) {
          writes.push(sqlRaw`
            UPDATE packaging_stock SET quantity = quantity - ${item.quantity_sent}, updated_at = NOW()
            WHERE depot_id = ${transfer.source_depot_id} AND packaging_type_id = ${item.packaging_type_id}
          `)
        }
      }
    }

    // 2. Update received quantities (scoped to this transfer)
    for (const [itemId, vals] of bodyMap) {
      writes.push(sqlRaw`
        UPDATE depot_transfer_items SET
          quantity_received = ${vals.quantity_received || 0},
          quantity_damaged = ${vals.quantity_damaged || 0}
        WHERE id = ${itemId} AND depot_transfer_id = ${transferId}
      `)
    }

    // 3. Add to destination depot (upsert using pre-read sets)
    for (const item of transferItems) {
      const qtyReceived = Number(bodyMap.get(item.id)?.quantity_received || item.quantity_sent)
      if (item.product_variant_id) {
        if (destStockSet.has(item.product_variant_id)) {
          writes.push(sqlRaw`
            UPDATE stock SET quantity = quantity + ${qtyReceived}, updated_at = NOW()
            WHERE depot_id = ${transfer.destination_depot_id} AND product_variant_id = ${item.product_variant_id}
          `)
        } else {
          writes.push(sqlRaw`
            INSERT INTO stock (depot_id, product_variant_id, quantity) VALUES (${transfer.destination_depot_id}, ${item.product_variant_id}, ${qtyReceived})
          `)
          destStockSet.add(item.product_variant_id)
        }
        writes.push(sqlRaw`
          INSERT INTO stock_movements (company_id, depot_id, product_variant_id, movement_type, quantity, reference_type, reference_id, created_by)
          VALUES (${companyId}, ${transfer.destination_depot_id}, ${item.product_variant_id}, 'transfer', ${qtyReceived}, 'depot_transfer', ${transferId}, ${userId})
        `)
      }
      if (item.packaging_type_id) {
        if (destPkgSet.has(item.packaging_type_id)) {
          writes.push(sqlRaw`
            UPDATE packaging_stock SET quantity = quantity + ${qtyReceived}, updated_at = NOW()
            WHERE depot_id = ${transfer.destination_depot_id} AND packaging_type_id = ${item.packaging_type_id}
          `)
        } else {
          writes.push(sqlRaw`
            INSERT INTO packaging_stock (depot_id, packaging_type_id, quantity) VALUES (${transfer.destination_depot_id}, ${item.packaging_type_id}, ${qtyReceived})
          `)
          destPkgSet.add(item.packaging_type_id)
        }
      }
    }

    // 4. Mark transfer as received
    writes.push(sqlRaw`
      UPDATE depot_transfers SET status = 'received', received_by = ${userId}, received_at = NOW(), updated_at = NOW()
      WHERE id = ${transferId}
    `)

    // Execute the whole reception atomically
    await transaction(writes)

    return NextResponse.json({ success: true, message: 'Transfert réceptionné' })
  } catch (error) {
    console.error('Receive transfer error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
