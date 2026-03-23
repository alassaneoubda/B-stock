import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/invoices/[id] — Get invoice detail with items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { id } = await params

    const invoices = await sql`
      SELECT i.*,
        c.name as client_name,
        c.phone as client_phone,
        c.address as client_address,
        c.email as client_email,
        s.name as supplier_name,
        s.phone as supplier_phone,
        s.address as supplier_address,
        s.email as supplier_email,
        comp.name as company_name,
        comp.phone as company_phone,
        comp.address as company_address,
        comp.email as company_email
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      LEFT JOIN companies comp ON i.company_id = comp.id
      WHERE i.id = ${id}
        AND i.company_id = ${session.user.companyId}
    `

    if (invoices.length === 0) {
      return NextResponse.json({ error: 'Facture non trouvée' }, { status: 404 })
    }

    const items = await sql`
      SELECT ii.*, p.name as product_name
      FROM invoice_items ii
      LEFT JOIN products p ON ii.product_id = p.id
      WHERE ii.invoice_id = ${id}
      ORDER BY ii.created_at
    `

    return NextResponse.json({
      success: true,
      data: { ...invoices[0], items }
    })
  } catch (error) {
    console.error('Error fetching invoice:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération' }, { status: 500 })
  }
}

// DELETE /api/invoices/[id] — Delete invoice
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { id } = await params

    await sql`
      DELETE FROM invoices
      WHERE id = ${id} AND company_id = ${session.user.companyId}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting invoice:', error)
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 })
  }
}
