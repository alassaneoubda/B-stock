import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { payPosOrder } from '@/lib/domain/pos'
import { handleRouteError, notFound } from '@/lib/errors'
import { requirePosActor } from '@/lib/pos-auth'
import { isUuid } from '@/lib/tenant'

const paySchema = z.object({
  paymentMethod: z.enum(['cash', 'mobile_money', 'credit', 'mixed']),
  paidAmount: z.number().min(0).max(1e12),
  cashAmount: z.number().min(0).max(1e12).optional(),
})

// POST /api/pos/orders/[id]/pay — encaisse et clôt le ticket
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePosActor()
    if (!auth.ok) return auth.response
    const { id } = await params
    if (!isUuid(id)) throw notFound('Ticket')
    const result = await payPosOrder(auth.actor, id, paySchema.parse(await request.json()))
    return NextResponse.json({ success: true, data: result, warnings: result.warnings })
  } catch (error) {
    return handleRouteError(error, 'pos.pay')
  }
}
