import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// POST /api/breakage/[id]/approve — Approve breakage and deduct stock
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const companyId = session.user.companyId
    const userId = session.user.id
    const breakageId = params.id
    const body = await request.json()
    const { action } = body // 'approve' or 'reject'

    const records = await sql`
      SELECT * FROM breakage_records WHERE id = ${breakageId} AND company_id = ${companyId}
    `
    if (records.length === 0) {
      return NextResponse.json({ error: 'Enregistrement introuvable' }, { status: 404 })
    }

    const record = records[0]
    if (record.status !== 'reported') {
      return NextResponse.json({ error: 'Déjà traité' }, { status: 400 })
    }

    if (action === 'reject') {
      await sql`
        UPDATE breakage_records SET status = 'rejected', approved_by = ${userId}, updated_at = NOW()
        WHERE id = ${breakageId}
      `
      return NextResponse.json({ success: true, message: 'Rejeté' })
    }

    // Approve: deduct stock
    if (record.product_variant_id && record.depot_id) {
      await sql`
        UPDATE stock SET quantity = GREATEST(0, quantity - ${record.quantity}), updated_at = NOW()
        WHERE depot_id = ${record.depot_id} AND product_variant_id = ${record.product_variant_id}
      `
      await sql`
        INSERT INTO stock_movements (company_id, depot_id, product_variant_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
        VALUES (${companyId}, ${record.depot_id}, ${record.product_variant_id}, 'damage', ${-record.quantity}, 'breakage', ${breakageId}, ${record.reason || record.record_type}, ${userId})
      `
    }
    if (record.packaging_type_id && record.depot_id) {
      await sql`
        UPDATE packaging_stock SET quantity = GREATEST(0, quantity - ${record.quantity}), updated_at = NOW()
        WHERE depot_id = ${record.depot_id} AND packaging_type_id = ${record.packaging_type_id}
      `
    }

    await sql`
      UPDATE breakage_records SET status = 'approved', approved_by = ${userId}, updated_at = NOW()
      WHERE id = ${breakageId}
    `

    return NextResponse.json({ success: true, message: 'Approuvé et stock ajusté' })
  } catch (error) {
    console.error('Approve breakage error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
