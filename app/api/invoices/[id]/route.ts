import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { assertPeriodOpen } from '@/lib/accounting/period-lock'

// GET /api/invoices/[id] — Get invoice detail with items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await requirePermission('invoices.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { id } = await params
    if (!isUuid(id)) throw new AppError(404, 'Facture non trouvée', 'NOT_FOUND')

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
        comp.email as company_email,
        comp.tax_id as company_tax_id,
        comp.vat_enabled as company_vat_enabled
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      LEFT JOIN companies comp ON i.company_id = comp.id
      WHERE i.id = ${id}
        AND i.company_id = ${companyId}
    `

    if (invoices.length === 0) {
      return NextResponse.json({ error: 'Facture non trouvée' }, { status: 404 })
    }

    // product_id peut contenir un produit ou une variante (selon l'origine de la facture)
    const items = await sql`
      SELECT ii.*, p.name as product_name
      FROM invoice_items ii
      LEFT JOIN product_variants pv ON pv.id = ii.product_id
      LEFT JOIN products p ON p.id = COALESCE(pv.product_id, ii.product_id)
      WHERE ii.invoice_id = ${id}
      ORDER BY ii.created_at,
        CASE ii.item_type WHEN 'product' THEN 0 WHEN 'packaging' THEN 1 ELSE 2 END,
        ii.id
    `

    return NextResponse.json({
      success: true,
      data: { ...invoices[0], items }
    })
  } catch (error) {
    return handleRouteError(error, 'invoices.get')
  }
}

const patchSchema = z.object({
  status: z.literal('cancelled'),
})

// PATCH /api/invoices/[id] — Cancel an invoice ({ status: 'cancelled' })
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await requirePermission('invoices.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { id } = await params
    if (!isUuid(id)) throw notFound('Facture')
    patchSchema.parse(await request.json())

    // Annulation refusée si la facture est datée d'un mois clôturé
    const [current] = await sql`SELECT created_at FROM invoices WHERE id = ${id} AND company_id = ${companyId}`
    if (current) await assertPeriodOpen(sql, companyId, current.created_at)

    const rows = await sql`
      UPDATE invoices SET status = 'cancelled', updated_at = NOW()
      WHERE id = ${id} AND company_id = ${companyId} AND status <> 'cancelled'
      RETURNING *
    `
    if (rows.length === 0) {
      const exists = await sql`SELECT 1 FROM invoices WHERE id = ${id} AND company_id = ${companyId}`
      if (exists.length === 0) throw notFound('Facture')
      throw new AppError(409, 'Cette facture est déjà annulée', 'ALREADY_CANCELLED')
    }

    return NextResponse.json({ success: true, data: rows[0], message: 'Facture annulée' })
  } catch (error) {
    return handleRouteError(error, 'invoices.cancel')
  }
}

// DELETE /api/invoices/[id] — Delete an unpaid invoice
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await requirePermission('invoices.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { id } = await params
    if (!isUuid(id)) throw notFound('Facture')

    await withTransaction(async (tx) => {
      const [invoice] = await tx.sql`
        SELECT id, status, amount_paid, created_at FROM invoices
        WHERE id = ${id} AND company_id = ${companyId}
        FOR UPDATE
      `
      if (!invoice) throw notFound('Facture')
      await assertPeriodOpen(tx.sql, companyId, invoice.created_at)
      if (invoice.status === 'paid' || invoice.status === 'partial' || Number(invoice.amount_paid) > 0) {
        throw new AppError(
          409,
          'Impossible de supprimer une facture payée ou partiellement payée : annulez-la plutôt (statut « annulée »).',
          'INVOICE_PAID'
        )
      }
      await tx.sql`DELETE FROM invoices WHERE id = ${id} AND company_id = ${companyId}`
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'invoices.delete')
  }
}
