import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { sql } from '@/lib/db'

/** En deçà, le client est peut-être encore sur la page de paiement. */
const MIN_AGE_MINUTES = 60

// POST /api/admin/billing/checkouts/:id/expire — clôt un paiement initié resté sans suite
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireAdmin('billing.write')
  if (!authz.ok) return authz.response
  try {
    const { id } = await params
    const [checkout] = await sql`
      SELECT id, status, reference, created_at < NOW() - make_interval(mins => ${MIN_AGE_MINUTES}::int) AS stale
      FROM subscription_checkouts WHERE id = ${id}
    `
    if (!checkout) throw notFound('Paiement')
    if (checkout.status !== 'pending') {
      throw new AppError(409, 'Ce paiement n’est plus en attente', 'NOT_PENDING')
    }
    if (!checkout.stale) {
      throw new AppError(409, `Paiement trop récent : attendez au moins ${MIN_AGE_MINUTES} minutes ou vérifiez-le`, 'TOO_RECENT')
    }
    const updated = await sql`
      UPDATE subscription_checkouts SET status = 'expired', updated_at = NOW()
      WHERE id = ${id} AND status = 'pending'
      RETURNING id
    `
    if (updated.length === 0) throw new AppError(409, 'Ce paiement n’est plus en attente', 'NOT_PENDING')
    await logAdminAction(authz.adminId, authz.adminEmail, 'checkout.expire', 'checkout', id, {
      reference: checkout.reference,
    })
    return NextResponse.json({ success: true, status: 'expired' })
  } catch (e) {
    return handleRouteError(e, 'admin checkout expire')
  }
}
