import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { handleRouteError } from '@/lib/errors'
import { sql } from '@/lib/db'
import { MANUAL_METHODS, recordManualPayment, type ManualMethod } from '@/lib/billing-admin'

export const dynamic = 'force-dynamic'

const methodKeys = Object.keys(MANUAL_METHODS) as [ManualMethod, ...ManualMethod[]]

const schema = z.object({
  companyId: z.string().uuid('Entreprise invalide'),
  planId: z.string().trim().min(1, 'Plan requis').max(100),
  months: z.coerce.number().int().min(1, 'Durée invalide').max(36, 'Durée invalide'),
  amount: z.coerce.number().min(0, 'Montant invalide').max(100_000_000, 'Montant invalide'),
  method: z.enum(methodKeys, { errorMap: () => ({ message: 'Moyen de paiement invalide' }) }),
  reference: z.string().trim().max(200).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
})

/**
 * GET /api/admin/billing/manual?q=… — données du formulaire : plans actifs et
 * entreprises correspondant à la recherche (20 max).
 */
export async function GET(request: NextRequest) {
  const authz = await requireAdmin('billing.write')
  if (!authz.ok) return authz.response
  try {
    const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 100)
    const like = `%${q}%`
    const companies = await sql`
      SELECT id, name, subscription_status, subscription_ends_at, trial_ends_at
      FROM companies
      WHERE (${q} = '' OR name ILIKE ${like} OR slug ILIKE ${like})
      ORDER BY name ASC
      LIMIT 20
    `
    const plans = await sql`
      SELECT name, COALESCE(display_name, name) AS label, price_monthly, price_yearly
      FROM subscription_plans WHERE is_active = true
      ORDER BY price_monthly ASC NULLS LAST
    `
    return NextResponse.json({ success: true, companies, plans, methods: MANUAL_METHODS })
  } catch (e) {
    return handleRouteError(e, 'admin manual payment options')
  }
}

// POST /api/admin/billing/manual — enregistre un paiement reçu hors ligne
export async function POST(request: NextRequest) {
  const authz = await requireAdmin('billing.write')
  if (!authz.ok) return authz.response
  try {
    const body = schema.parse(await request.json())
    const result = await recordManualPayment({ ...body, recordedBy: authz.adminEmail })
    await logAdminAction(authz.adminId, authz.adminEmail, 'payment.manual', 'payment', result.paymentId, {
      companyId: body.companyId,
      planId: body.planId,
      months: body.months,
      amount: body.amount,
      method: body.method,
      reference: result.reference,
      receiptNumber: result.receiptNumber,
      endsAt: result.endsAt,
    })
    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (e) {
    return handleRouteError(e, 'admin manual payment')
  }
}
