import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'

const schema = z.object({
  // null ou '' : retour à l'échéance calculée (réception + conditions du fournisseur)
  dueDate: z
    .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ)')])
    .nullable()
    .transform((v) => v || null),
})

// PUT /api/procurement/[id]/payments/due-date — échéance de paiement saisie à la main (date de la facture fournisseur…)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('purchases.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { id } = await params
    if (!isUuid(id)) throw notFound('Commande')

    const { dueDate } = schema.parse(await request.json())
    const rows = await sql`
      UPDATE purchase_orders SET payment_due_date = ${dueDate}::date, updated_at = NOW()
      WHERE id = ${id} AND company_id = ${companyId}
      RETURNING id, payment_due_date::text AS payment_due_date
    `
    if (rows.length === 0) throw notFound('Commande')

    return NextResponse.json({
      success: true,
      data: rows[0],
      message: dueDate ? 'Échéance mise à jour' : 'Échéance recalculée selon les conditions du fournisseur',
    })
  } catch (error) {
    return handleRouteError(error, 'procurement.payments.dueDate')
  }
}
