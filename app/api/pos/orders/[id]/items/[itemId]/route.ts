import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getPosOrder, reducePosItem } from '@/lib/domain/pos'
import { handleRouteError, notFound } from '@/lib/errors'
import { requirePosActor } from '@/lib/pos-auth'
import { isUuid } from '@/lib/tenant'

const reduceSchema = z.object({
  quantity: z.number().int().min(0),
  reason: z.string().trim().max(300).nullish(),
})

// PATCH /api/pos/orders/[id]/items/[itemId] — diminue / retire une ligne
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const auth = await requirePosActor()
    if (!auth.ok) return auth.response
    const { id, itemId } = await params
    if (!isUuid(id) || !isUuid(itemId)) throw notFound('Article')
    const result = await reducePosItem(auth.actor, id, itemId, reduceSchema.parse(await request.json()))
    return NextResponse.json({ success: true, voided: result.voided, data: await getPosOrder(auth.actor.companyId, id) })
  } catch (error) {
    return handleRouteError(error, 'pos.items.reduce')
  }
}
