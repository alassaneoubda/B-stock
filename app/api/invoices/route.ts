import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
import { assertOwned } from '@/lib/tenant'
import { nextDocumentNumber } from '@/lib/sequences'
import { money } from '@/lib/domain/payments'
import { assertPeriodOpen } from '@/lib/accounting/period-lock'

const INVOICE_TYPES = ['client', 'supplier'] as const
const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'partial', 'cancelled'] as const

// GET /api/invoices — List invoices with filters
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('invoices.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const typeParam = searchParams.get('type')
    const statusParam = searchParams.get('status')
    const type = typeParam && (INVOICE_TYPES as readonly string[]).includes(typeParam) ? typeParam : null
    const status = statusParam && (INVOICE_STATUSES as readonly string[]).includes(statusParam) ? statusParam : null
    const search = searchParams.get('search')?.trim() || null
    const searchPattern = search ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10) || 100, 1), 500)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

    const invoices = await sql`
      SELECT i.*,
        c.name as client_name,
        s.name as supplier_name
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.company_id = ${companyId}
        AND (${type}::text IS NULL OR i.type = ${type}::text)
        AND (${status}::text IS NULL OR i.status = ${status}::text)
        AND (
          ${searchPattern}::text IS NULL
          OR i.invoice_number ILIKE ${searchPattern}::text
          OR c.name ILIKE ${searchPattern}::text
          OR s.name ILIKE ${searchPattern}::text
        )
      ORDER BY i.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    return NextResponse.json({ success: true, data: invoices })
  } catch (error) {
    return handleRouteError(error, 'invoices.list')
  }
}

const optionalUuid = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().uuid().optional()
)

const invoiceSchema = z
  .object({
    type: z.enum(INVOICE_TYPES),
    clientId: optionalUuid,
    supplierId: optionalUuid,
    orderId: optionalUuid,
    items: z
      .array(
        z.object({
          productId: optionalUuid,
          description: z.string().max(500).optional().nullable(),
          quantity: z.coerce.number().positive('Quantité invalide'),
          unitPrice: z.coerce.number().nonnegative('Prix invalide'),
          itemType: z.enum(['product', 'packaging', 'service']).optional().default('product'),
        })
      )
      .max(500)
      .optional()
      .default([]),
    notes: z.string().max(2000).optional().nullable(),
    amountPaid: z.coerce.number().nonnegative().optional().default(0),
  })
  .refine((d) => (d.type === 'client' ? !!d.clientId && !d.supplierId : !!d.supplierId && !d.clientId), {
    message: 'Facture client : client requis ; facture fournisseur : fournisseur requis',
    path: ['type'],
  })

// POST /api/invoices — Create a new invoice
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('invoices.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const data = invoiceSchema.parse(await request.json())

    // Totaux recalculés côté serveur à partir des lignes
    const lines = data.items.map((item) => {
      const unitPrice = money(item.unitPrice)
      return { ...item, unitPrice, total: money(item.quantity * unitPrice) }
    })
    const totalAmount = money(lines.reduce((s, l) => s + l.total, 0))
    const paid = money(data.amountPaid)
    if (paid > totalAmount) {
      throw new AppError(400, 'Le montant payé dépasse le total de la facture', 'AMOUNT_EXCEEDS_TOTAL')
    }
    const remaining = money(totalAmount - paid)
    const invoiceStatus = totalAmount > 0 && paid >= totalAmount ? 'paid' : paid > 0 ? 'partial' : 'draft'

    const invoice = await withTransaction(async (tx) => {
      // Facture datée d'aujourd'hui : refusée si le mois est clôturé
      await assertPeriodOpen(tx.sql, companyId)
      await assertOwned(tx.sql, companyId, {
        clients: [data.clientId],
        suppliers: [data.supplierId],
        ...(data.type === 'client' ? { salesOrders: [data.orderId] } : { purchaseOrders: [data.orderId] }),
      })

      if (data.orderId && data.type === 'client') {
        const [order] = await tx.sql`SELECT client_id FROM sales_orders WHERE id = ${data.orderId}`
        if (order.client_id !== data.clientId) {
          throw new AppError(400, "Cette commande n'appartient pas à ce client", 'ORDER_CLIENT_MISMATCH')
        }
      }

      // product_id : produit ou variante de l'entreprise
      const productIds = [...new Set(lines.map((l) => l.productId).filter((v): v is string => !!v))]
      if (productIds.length > 0) {
        const owned = await tx.sql`
          SELECT id FROM products WHERE company_id = ${companyId} AND id = ANY(${productIds}::uuid[])
          UNION
          SELECT pv.id FROM product_variants pv JOIN products p ON p.id = pv.product_id
          WHERE p.company_id = ${companyId} AND pv.id = ANY(${productIds}::uuid[])
        `
        if (owned.length !== productIds.length) throw new AppError(404, 'Produit introuvable', 'NOT_FOUND')
      }

      const invoiceNumber = await nextDocumentNumber(
        tx,
        companyId,
        data.type === 'client' ? 'invoice_client' : 'invoice_supplier'
      )

      const [row] = await tx.sql`
        INSERT INTO invoices (
          invoice_number, type, company_id, client_id, supplier_id,
          order_id, total_ht, total_ttc, total_amount,
          amount_paid, remaining_amount, status, notes
        ) VALUES (
          ${invoiceNumber}, ${data.type}, ${companyId},
          ${data.clientId ?? null}, ${data.supplierId ?? null},
          ${data.orderId ?? null}, ${totalAmount}, ${totalAmount}, ${totalAmount},
          ${paid}, ${remaining}, ${invoiceStatus}, ${data.notes || null}
        )
        RETURNING *
      `

      for (const line of lines) {
        await tx.sql`
          INSERT INTO invoice_items (
            invoice_id, product_id, description,
            quantity, unit_price, total_price, item_type
          ) VALUES (
            ${row.id}, ${line.productId ?? null}, ${line.description || null},
            ${line.quantity}, ${line.unitPrice}, ${line.total}, ${line.itemType}
          )
        `
      }
      return row
    })

    return NextResponse.json({ success: true, data: invoice }, { status: 201 })
  } catch (error) {
    return handleRouteError(error, 'invoices.create')
  }
}
