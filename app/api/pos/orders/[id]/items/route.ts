import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { addPosItems, getPosOrder } from '@/lib/domain/pos'
import { handleRouteError, notFound } from '@/lib/errors'
import { requirePosActor } from '@/lib/pos-auth'
import { isUuid } from '@/lib/tenant'

const addSchema = z.object({
  items: z
    .array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().positive().max(1000) }))
    .min(1)
    .max(100),
})

// POST /api/pos/orders/[id]/items — ajoute des articles (prix catalogue)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePosActor()
    if (!auth.ok) return auth.response
    const { id } = await params
    if (!isUuid(id)) throw notFound('Ticket')
    const { items } = addSchema.parse(await request.json())
    await addPosItems(auth.actor, id, items)
    return NextResponse.json({ success: true, data: await getPosOrder(auth.actor.companyId, id) })
  } catch (error) {
    return handleRouteError(error, 'pos.items.add')
  }
}
