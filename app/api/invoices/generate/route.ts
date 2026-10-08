import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { withTransaction } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
import { nextDocumentNumber } from '@/lib/sequences'
import { money } from '@/lib/domain/payments'
import { assertPeriodOpen } from '@/lib/accounting/period-lock'

const generateSchema = z.object({
  orderId: z.string().uuid('orderId requis'),
})

/**
 * POST /api/invoices/generate — Auto-generate the client invoice of a sales order.
 *
 * Idempotent : la ligne de la commande est verrouillée (FOR UPDATE) avant de
 * chercher une facture existante, donc deux appels simultanés ne créent
 * jamais deux factures ; si une facture (non annulée) existe déjà, elle est
 * renvoyée telle quelle.
 */
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('invoices.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { orderId } = generateSchema.parse(await request.json())

    const result = await withTransaction(async (tx) => {
      const [order] = await tx.sql`
        SELECT id, client_id, paid_amount, status
        FROM sales_orders
        WHERE id = ${orderId} AND company_id = ${companyId}
        FOR UPDATE
      `
      if (!order) throw new AppError(404, 'Commande non trouvée', 'NOT_FOUND')

      const [existing] = await tx.sql`
        SELECT * FROM invoices
        WHERE order_id = ${orderId} AND company_id = ${companyId}
          AND type = 'client' AND status <> 'cancelled'
        ORDER BY created_at ASC
        LIMIT 1
      `
      if (existing) return { invoice: existing, created: false }

      if (order.status === 'cancelled') {
        throw new AppError(409, 'Commande annulée : aucune facture ne peut être générée', 'ORDER_CANCELLED')
      }
      // Nouvelle facture datée d'aujourd'hui : refusée si le mois est clôturé
      await assertPeriodOpen(tx.sql, companyId)

      // Lignes produits : variante → produit (+ conditionnement pour le libellé)
      const orderItems = await tx.sql`
        SELECT soi.product_variant_id, soi.quantity, soi.unit_price,
               COALESCE(soi.total_price, soi.quantity * soi.unit_price) AS line_total,
               soi.vat_rate, soi.amount_ht, soi.vat_amount,
               p.name AS product_name, pt.name AS packaging_name
        FROM sales_order_items soi
        JOIN product_variants pv ON pv.id = soi.product_variant_id
        JOIN products p ON p.id = pv.product_id
        LEFT JOIN packaging_types pt ON pt.id = pv.packaging_type_id
        WHERE soi.sales_order_id = ${orderId}
        ORDER BY soi.created_at, soi.id
      `

      // Consignes : uniquement le net sorti (sorties - retours) > 0
      const packagingItems = await tx.sql`
        SELECT sopi.packaging_type_id, sopi.quantity_out - sopi.quantity_in AS net_quantity,
               COALESCE(sopi.unit_price, 0) AS unit_price, pt.name AS packaging_name
        FROM sales_order_packaging_items sopi
        LEFT JOIN packaging_types pt ON pt.id = sopi.packaging_type_id
        WHERE sopi.sales_order_id = ${orderId}
          AND sopi.quantity_out - sopi.quantity_in > 0
        ORDER BY sopi.created_at, sopi.id
      `

      const lines = [
        ...orderItems.map((i) => ({
          productId: i.product_variant_id as string | null,
          description: i.packaging_name ? `${i.product_name} (${i.packaging_name})` : i.product_name || 'Produit',
          quantity: Number(i.quantity),
          unitPrice: money(Number(i.unit_price || 0)),
          total: money(Number(i.line_total || 0)),
          itemType: 'product',
          // TVA figée sur la ligne de vente (null : vente sans TVA)
          vat:
            i.vat_amount == null
              ? null
              : { rate: Number(i.vat_rate), ht: Number(i.amount_ht), vat: Number(i.vat_amount) },
        })),
        ...packagingItems.map((p) => ({
          productId: null as string | null,
          description: `Consigne ${p.packaging_name || 'emballage'}`,
          quantity: Number(p.net_quantity),
          unitPrice: money(Number(p.unit_price)),
          total: money(Number(p.net_quantity) * Number(p.unit_price)),
          itemType: 'packaging',
          vat: null as { rate: number; ht: number; vat: number } | null,
        })),
      ]
      const hasVat = lines.some((l) => l.vat)
      const totalVat = money(lines.reduce((s, l) => s + (l.vat?.vat ?? 0), 0))

      // Totaux recalculés à partir des lignes de la facture
      const totalAmount = money(lines.reduce((s, l) => s + l.total, 0))
      const amountPaid = money(Math.min(Number(order.paid_amount || 0), totalAmount))
      const remaining = money(totalAmount - amountPaid)
      const invoiceStatus =
        totalAmount > 0 && amountPaid >= totalAmount ? 'paid' : amountPaid > 0 ? 'partial' : 'draft'
      const invoiceNumber = await nextDocumentNumber(tx, companyId, 'invoice_client')

      const [invoice] = await tx.sql`
        INSERT INTO invoices (
          invoice_number, type, company_id, client_id,
          order_id, total_ht, total_ttc, total_amount,
          amount_paid, remaining_amount, status
        ) VALUES (
          ${invoiceNumber}, 'client', ${companyId}, ${order.client_id},
          ${orderId}, ${totalAmount}, ${totalAmount}, ${totalAmount},
          ${amountPaid}, ${remaining}, ${invoiceStatus}
        )
        RETURNING *
      `
      if (hasVat) {
        const [withVat] = await tx.sql`
          UPDATE invoices SET total_ht = ${money(totalAmount - totalVat)}, total_vat = ${totalVat}
          WHERE id = ${invoice.id} RETURNING *
        `
        Object.assign(invoice, withVat)
      }

      for (const line of lines) {
        if (line.vat) {
          await tx.sql`
            INSERT INTO invoice_items (
              invoice_id, product_id, description,
              quantity, unit_price, total_price, item_type, vat_rate, amount_ht, vat_amount
            ) VALUES (
              ${invoice.id}, ${line.productId}, ${line.description},
              ${line.quantity}, ${line.unitPrice}, ${line.total}, ${line.itemType},
              ${line.vat.rate}, ${line.vat.ht}, ${line.vat.vat}
            )
          `
          continue
        }
        await tx.sql`
          INSERT INTO invoice_items (
            invoice_id, product_id, description,
            quantity, unit_price, total_price, item_type
          ) VALUES (
            ${invoice.id}, ${line.productId}, ${line.description},
            ${line.quantity}, ${line.unitPrice}, ${line.total}, ${line.itemType}
          )
        `
      }
      return { invoice, created: true }
    })

    if (!result.created) {
      return NextResponse.json({ success: true, data: result.invoice, message: 'Facture déjà générée' })
    }
    return NextResponse.json(
      { success: true, data: result.invoice, message: 'Facture générée avec succès' },
      { status: 201 }
    )
  } catch (error) {
    return handleRouteError(error, 'invoices.generate')
  }
}
