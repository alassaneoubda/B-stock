import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { sql } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { PROVIDER_LABELS, ensureReceiptNumber, renderReceiptHtml } from '@/lib/billing-admin'

export const dynamic = 'force-dynamic'

// GET /api/admin/billing/:id/receipt — reçu HTML imprimable (attribue un numéro s'il manque)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireAdmin('billing.read')
  if (!authz.ok) return authz.response
  try {
    const { id } = await params
    const [p] = await sql`
      SELECT sp.*, c.name AS company_name
      FROM subscription_payments sp
      LEFT JOIN companies c ON c.id = sp.company_id
      WHERE sp.id = ${id}
    `
    if (!p) throw notFound('Paiement')
    if (!['completed', 'manual', 'refunded'].includes(p.status)) {
      throw new AppError(409, 'Aucun reçu pour un paiement non abouti', 'NO_RECEIPT')
    }

    const receipt = await ensureReceiptNumber(id)
    if (receipt.assigned) {
      await logAdminAction(authz.adminId, authz.adminEmail, 'payment.receipt_number', 'payment', id, {
        receiptNumber: receipt.number,
      })
    }
    const settings = await getSettings()
    const meta = (p.metadata ?? {}) as Record<string, unknown>
    const method =
      (typeof meta.methodLabel === 'string' && meta.methodLabel) ||
      (typeof meta.paymentMethod === 'string' && meta.paymentMethod !== 'manual' && meta.paymentMethod) ||
      PROVIDER_LABELS[p.provider] ||
      String(p.provider || '—')

    const html = renderReceiptHtml({
      platformName: settings.platform_name || 'B-Stock',
      supportEmail: settings.support_email,
      receiptNumber: receipt.number,
      companyName: p.company_name || 'Entreprise supprimée',
      planName: p.plan_name || '—',
      months: Number(p.months) || 0,
      periodStart: typeof meta.periodStart === 'string' ? meta.periodStart : null,
      periodEnd: typeof meta.periodEnd === 'string' ? meta.periodEnd : null,
      amount: Number(p.amount) || 0,
      currency: p.currency || 'XOF',
      method,
      reference: p.reference,
      paidAt: p.created_at,
      status: p.status === 'refunded' ? 'refunded' : 'paid',
      refundedAt: p.refunded_at,
      refundReason: p.refund_reason,
    })
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch (e) {
    return handleRouteError(e, 'admin receipt')
  }
}
