import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { handleRouteError } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import { isUuid } from '@/lib/tenant'
import {
  createPaymentRequest,
  getPaymentRequest,
  listPaymentRequests,
  type MobileMoneyStatus,
} from '@/lib/mobile-money/requests'

const STATUSES: MobileMoneyStatus[] = ['pending', 'paid', 'failed', 'expired', 'cancelled']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// GET /api/payments/mobile-money — suivi des demandes (filtres statut / période)
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('payments.read')
    if (!authz.ok) return authz.response

    const sp = new URL(request.url).searchParams
    const status = sp.get('status')
    const from = sp.get('from')
    const to = sp.get('to')
    const salesOrderId = sp.get('salesOrderId')
    const creditNoteId = sp.get('creditNoteId')
    if (
      (status && !STATUSES.includes(status as MobileMoneyStatus)) ||
      (from && !DATE_RE.test(from)) ||
      (to && !DATE_RE.test(to)) ||
      (salesOrderId && !isUuid(salesOrderId)) ||
      (creditNoteId && !isUuid(creditNoteId))
    ) {
      return NextResponse.json({ error: 'Filtre invalide', code: 'BAD_FILTER' }, { status: 400 })
    }

    const { rows, totals } = await listPaymentRequests(authz.companyId, {
      status: (status as MobileMoneyStatus) || null,
      from,
      to,
      salesOrderId,
      creditNoteId,
      limit: parseInt(sp.get('limit') || '100', 10) || 100,
      offset: parseInt(sp.get('offset') || '0', 10) || 0,
    })
    return NextResponse.json({ success: true, data: rows, totals })
  } catch (error) {
    return handleRouteError(error, 'mobile-money.list')
  }
}

const createSchema = z
  .object({
    salesOrderId: z.string().uuid().optional().nullable(),
    creditNoteId: z.string().uuid().optional().nullable(),
    accountType: z.enum(['product', 'packaging']).optional().nullable(),
    amount: z.coerce.number().int('Montant en FCFA entiers').positive('Le montant doit être positif'),
    customerPhone: z.string().trim().max(30).optional().nullable(),
  })
  .refine((d) => Boolean(d.salesOrderId) !== Boolean(d.creditNoteId), {
    message: 'Indiquez une vente ou une créance (une seule)',
  })

// POST /api/payments/mobile-money — crée une demande de paiement GeniusPay
export async function POST(request: NextRequest) {
  try {
    const data = createSchema.parse(await request.json())
    const authz = await requirePermission(data.creditNoteId ? 'credits.write' : 'payments.write')
    if (!authz.ok) return authz.response

    const limited = await rateLimit('mobile-money-create', authz.userId, { limit: 30, windowSeconds: 600 })
    if (limited) return limited

    const row = await createPaymentRequest({
      companyId: authz.companyId,
      userId: authz.userId,
      salesOrderId: data.salesOrderId || null,
      creditNoteId: data.creditNoteId || null,
      accountType: data.accountType || null,
      amount: data.amount,
      customerPhone: data.customerPhone || null,
    })
    const created = await getPaymentRequest(row.id, authz.companyId)
    return NextResponse.json({ success: true, data: created, message: 'Demande de paiement créée' }, { status: 201 })
  } catch (error) {
    return handleRouteError(error, 'mobile-money.create')
  }
}
