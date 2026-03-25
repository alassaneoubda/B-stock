import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// POST /api/returns/[id]/process — Approve and process a return (restock + credit/refund)
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const userId = session.user.id
    const returnId = params.id
    const body = await request.json()
    const { action } = body // 'approve' or 'reject'

    const returns = await sql`
      SELECT * FROM returns WHERE id = ${returnId} AND company_id = ${companyId}
    `
    if (returns.length === 0) {
      return NextResponse.json({ error: 'Retour introuvable' }, { status: 404 })
    }

    const ret = returns[0]
    if (ret.status !== 'pending') {
      return NextResponse.json({ error: 'Ce retour a déjà été traité' }, { status: 400 })
    }

    if (action === 'reject') {
      await sql`
        UPDATE returns SET status = 'rejected', processed_by = ${userId}, processed_at = NOW(), updated_at = NOW()
        WHERE id = ${returnId}
      `
      return NextResponse.json({ success: true, message: 'Retour rejeté' })
    }

    // Process: restock good items
    const items = await sql`
      SELECT * FROM return_items WHERE return_id = ${returnId}
    `

    for (const item of items) {
      if (item.condition === 'good' && item.product_variant_id && ret.depot_id) {
        // Restock
        await sql`
          UPDATE stock SET quantity = quantity + ${item.quantity}, updated_at = NOW()
          WHERE depot_id = ${ret.depot_id} AND product_variant_id = ${item.product_variant_id}
        `
        // Stock movement
        await sql`
          INSERT INTO stock_movements (company_id, depot_id, product_variant_id, movement_type, quantity, reference_type, reference_id, created_by)
          VALUES (${companyId}, ${ret.depot_id}, ${item.product_variant_id}, 'return', ${item.quantity}, 'return', ${returnId}, ${userId})
        `
      }
      // Damaged items go to breakage
      if (item.condition === 'damaged' && item.product_variant_id) {
        await sql`
          INSERT INTO breakage_records (company_id, depot_id, record_type, product_variant_id, item_type, quantity, unit_value, total_value, reason, reported_by, status)
          VALUES (${companyId}, ${ret.depot_id}, 'breakage', ${item.product_variant_id}, 'product', ${item.quantity}, ${item.unit_price || 0}, ${(item.quantity || 0) * (item.unit_price || 0)}, 'Retour client - produit endommagé', ${userId}, 'approved')
        `
      }
    }

    // If client return with credit_note refund method, create a credit
    if (ret.return_type === 'client' && ret.refund_method === 'credit_note' && ret.client_id) {
      const countResult = await sql`SELECT COUNT(*) as count FROM credit_notes WHERE company_id = ${companyId}`
      const creditNumber = `AV-${String(Number(countResult[0].count) + 1).padStart(5, '0')}`

      await sql`
        INSERT INTO credit_notes (company_id, client_id, sales_order_id, credit_number, total_amount, status, notes, created_by)
        VALUES (${companyId}, ${ret.client_id}, ${ret.sales_order_id}, ${creditNumber}, ${-Number(ret.total_amount)}, 'paid', ${'Avoir suite retour ' + ret.return_number}, ${userId})
      `

      // Update client balance (credit = positive for client)
      await sql`
        INSERT INTO client_accounts (client_id, account_type, balance)
        VALUES (${ret.client_id}, 'product', ${Number(ret.total_amount)})
        ON CONFLICT (client_id, account_type) DO UPDATE
        SET balance = client_accounts.balance + ${Number(ret.total_amount)}, last_transaction_at = NOW(), updated_at = NOW()
      `
    }

    await sql`
      UPDATE returns SET status = 'processed', processed_by = ${userId}, processed_at = NOW(), updated_at = NOW()
      WHERE id = ${returnId}
    `

    return NextResponse.json({ success: true, message: 'Retour traité avec succès' })
  } catch (error) {
    console.error('Process return error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
