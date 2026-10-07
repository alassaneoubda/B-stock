import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getPosOrder, updatePosOrder } from '@/lib/domain/pos'
import { handleRouteError, notFound } from '@/lib/errors'
import { requirePosActor } from '@/lib/pos-auth'
import { isUuid } from '@/lib/tenant'

type Params = { params: Promise<{ id: string }> }

// GET /api/pos/orders/[id] — détail du ticket
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const auth = await requirePosActor()
    if (!auth.ok) return auth.response
    const { id } = await params
    if (!isUuid(id)) throw notFound('Ticket')
    return NextResponse.json({ success: true, data: await getPosOrder(auth.actor.companyId, id) })
  } catch (error) {
    return handleRouteError(error, 'pos.order.get')
  }
}

const updateSchema = z.object({
  tableId: z.string().uuid().nullable().optional(),
  label: z.string().trim().max(100).nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  covers: z.number().int().min(1).max(500).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
})

// PATCH /api/pos/orders/[id] — transfert de table, nom, client (ardoise), couverts
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await requirePosActor()
    if (!auth.ok) return auth.response
    const { id } = await params
    if (!isUuid(id)) throw notFound('Ticket')
    await updatePosOrder(auth.actor, id, updateSchema.parse(await request.json()))
    return NextResponse.json({ success: true, data: await getPosOrder(auth.actor.companyId, id) })
  } catch (error) {
    return handleRouteError(error, 'pos.order.update')
  }
}
