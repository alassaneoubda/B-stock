import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, sqlRaw, transaction, type SqlQuery } from '@/lib/db'

const paymentSchema = z.object({
  amount: z.number().positive('Le montant doit être positif'),
  paymentMethod: z.enum(['cash', 'mobile_money', 'bank_transfer', 'orange_money', 'mtn_money', 'wave']),
  reference: z.string().optional(),
  notes: z.string().optional(),
})

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(amount)
}

// POST /api/clients/[id]/payments — Record a debt payment (products first, then packaging)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await requirePermission('payments.write')
    if (!authz.ok) return authz.response
    const { session, companyId } = authz

    const { id: clientId } = await params
    const body = await request.json()
    const data = paymentSchema.parse(body)

    // 1. Verify client belongs to company
    const clients = await sql`
      SELECT id, name FROM clients
      WHERE id = ${clientId} AND company_id = ${companyId} AND is_active = true
    `
    if (clients.length === 0) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    }

    // 2. Get current debts
    const accounts = await sql`
      SELECT account_type, balance FROM client_accounts
      WHERE client_id = ${clientId}
    `

    const productAccount = accounts.find((a: any) => a.account_type === 'product')
    const packagingAccount = accounts.find((a: any) => a.account_type === 'packaging')

    const productDebt = Math.abs(Math.min(0, Number(productAccount?.balance || 0)))
    const packagingDebt = Math.abs(Math.min(0, Number(packagingAccount?.balance || 0)))
    const totalDebt = productDebt + packagingDebt

    if (totalDebt <= 0) {
      return NextResponse.json({ error: 'Ce client n\'a aucune dette' }, { status: 400 })
    }

    if (data.amount > totalDebt) {
      return NextResponse.json({
        error: `Le montant (${formatCurrency(data.amount)}) dépasse la dette totale (${formatCurrency(totalDebt)})`,
      }, { status: 400 })
    }

    // 3. Allocate payment: products first, then packaging
    const paidForProducts = Math.min(productDebt, data.amount)
    const paidForPackaging = Math.min(packagingDebt, Math.max(0, data.amount - productDebt))

    // 4. Find unpaid orders to allocate payment to (oldest first) — READS first
    // Product allocations
    const productAllocations: { id: string; allocate: number }[] = []
    let remainingProductPayment = paidForProducts
    if (remainingProductPayment > 0) {
      const unpaidOrders = await sql`
        SELECT id, subtotal, paid_amount_products
        FROM sales_orders
        WHERE client_id = ${clientId}
          AND status != 'cancelled'
          AND subtotal > COALESCE(paid_amount_products, 0)
        ORDER BY created_at ASC
      `
      for (const order of unpaidOrders) {
        if (remainingProductPayment <= 0) break
        const orderProductDebt = Number(order.subtotal) - Number(order.paid_amount_products || 0)
        const allocate = Math.min(orderProductDebt, remainingProductPayment)
        productAllocations.push({ id: order.id, allocate })
        remainingProductPayment -= allocate
      }
    }

    // Packaging allocations
    const packagingAllocations: { id: string; allocate: number }[] = []
    let remainingPackagingPayment = paidForPackaging
    if (remainingPackagingPayment > 0) {
      const unpaidOrders = await sql`
        SELECT id, packaging_total, paid_amount_packaging
        FROM sales_orders
        WHERE client_id = ${clientId}
          AND status != 'cancelled'
          AND packaging_total > COALESCE(paid_amount_packaging, 0)
        ORDER BY created_at ASC
      `
      for (const order of unpaidOrders) {
        if (remainingPackagingPayment <= 0) break
        const orderPkgDebt = Number(order.packaging_total) - Number(order.paid_amount_packaging || 0)
        const allocate = Math.min(orderPkgDebt, remainingPackagingPayment)
        packagingAllocations.push({ id: order.id, allocate })
        remainingPackagingPayment -= allocate
      }
    }

    // 5. Build all writes and execute ATOMICALLY
    const writes: SqlQuery[] = []

    if (paidForProducts > 0) {
      writes.push(sqlRaw`
        UPDATE client_accounts
        SET balance = balance + ${paidForProducts},
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE client_id = ${clientId} AND account_type = 'product'
      `)
    }
    if (paidForPackaging > 0) {
      writes.push(sqlRaw`
        UPDATE client_accounts
        SET balance = balance + ${paidForPackaging},
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE client_id = ${clientId} AND account_type = 'packaging'
      `)
    }

    for (const alloc of productAllocations) {
      writes.push(sqlRaw`
        UPDATE sales_orders
        SET paid_amount_products = COALESCE(paid_amount_products, 0) + ${alloc.allocate},
            paid_amount = paid_amount + ${alloc.allocate},
            updated_at = NOW()
        WHERE id = ${alloc.id}
      `)
    }
    for (const alloc of packagingAllocations) {
      writes.push(sqlRaw`
        UPDATE sales_orders
        SET paid_amount_packaging = COALESCE(paid_amount_packaging, 0) + ${alloc.allocate},
            paid_amount = paid_amount + ${alloc.allocate},
            updated_at = NOW()
        WHERE id = ${alloc.id}
      `)
    }

    if (paidForProducts > 0) {
      writes.push(sqlRaw`
        INSERT INTO payments (
          company_id, client_id, amount,
          payment_method, payment_type, status,
          reference, notes, received_by
        ) VALUES (
          ${companyId}, ${clientId}, ${paidForProducts},
          ${data.paymentMethod}, 'product', 'completed',
          ${data.reference || null},
          ${data.notes || `Encaissement dette produits - ${clients[0].name}`},
          ${session.user.id}
        )
      `)
    }
    if (paidForPackaging > 0) {
      writes.push(sqlRaw`
        INSERT INTO payments (
          company_id, client_id, amount,
          payment_method, payment_type, status,
          reference, notes, received_by
        ) VALUES (
          ${companyId}, ${clientId}, ${paidForPackaging},
          ${data.paymentMethod}, 'packaging', 'completed',
          ${data.reference || null},
          ${data.notes || `Encaissement dette emballages - ${clients[0].name}`},
          ${session.user.id}
        )
      `)
    }

    await transaction(writes)

    // 7. Get updated balances
    const updatedAccounts = await sql`
      SELECT account_type, balance FROM client_accounts
      WHERE client_id = ${clientId}
    `

    const newProductBalance = Number(updatedAccounts.find((a: any) => a.account_type === 'product')?.balance || 0)
    const newPackagingBalance = Number(updatedAccounts.find((a: any) => a.account_type === 'packaging')?.balance || 0)

    return NextResponse.json({
      success: true,
      data: {
        paidForProducts,
        paidForPackaging,
        totalPaid: data.amount,
        newProductBalance,
        newPackagingBalance,
      },
      message: `Paiement de ${formatCurrency(data.amount)} enregistré (Produits: ${formatCurrency(paidForProducts)}, Emballages: ${formatCurrency(paidForPackaging)})`,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      )
    }
    console.error('Error recording payment:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'enregistrement du paiement' },
      { status: 500 }
    )
  }
}

// GET /api/clients/[id]/payments — Get payment history for a client
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authz = await requirePermission('payments.read')
    if (!authz.ok) return authz.response
    const { session } = authz

    const { id: clientId } = await params

    const payments = await sql`
      SELECT p.*, u.full_name as received_by_name,
             so.order_number
      FROM payments p
      LEFT JOIN users u ON p.received_by = u.id
      LEFT JOIN sales_orders so ON p.sales_order_id = so.id
      WHERE p.client_id = ${clientId}
        AND p.company_id = ${session.user.companyId}
      ORDER BY p.created_at DESC
      LIMIT 50
    `

    return NextResponse.json({ success: true, data: payments })
  } catch (error) {
    console.error('Error fetching payments:', error)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
