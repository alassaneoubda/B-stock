import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cancelPosOrder } from '@/lib/domain/pos'
import { handleRouteError, notFound } from '@/lib/errors'
import { requirePosActor } from '@/lib/pos-auth'
import { isUuid } from '@/lib/tenant'

const cancelSchema = z.object({ reason: z.string().trim().max(300).default('') })

// POST /api/pos/orders/[id]/cancel — annule le ticket (libère la réservation de stock)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePosActor()
    if (!auth.ok) return auth.response
    const { id } = await params
    if (!isUuid(id)) throw notFound('Ticket')
    const { reason } = cancelSchema.parse(await request.json().catch(() => ({})))
    await cancelPosOrder(auth.actor, id, reason)
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError(error, 'pos.cancel')
  }
}
