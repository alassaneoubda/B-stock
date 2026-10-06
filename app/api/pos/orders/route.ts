import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { openPosOrder } from '@/lib/domain/pos'
import { handleRouteError } from '@/lib/errors'
import { requirePosActor } from '@/lib/pos-auth'

const openSchema = z.object({
  depotId: z.string().uuid(),
  tableId: z.string().uuid().nullish(),
  orderType: z.enum(['table', 'counter', 'takeaway']).optional(),
  label: z.string().trim().max(100).nullish(),
  clientId: z.string().uuid().nullish(),
  covers: z.number().int().min(1).max(500).nullish(),
})

// POST /api/pos/orders — ouvre un ticket (ou renvoie le ticket ouvert de la table)
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePosActor()
    if (!auth.ok) return auth.response
    const data = openSchema.parse(await request.json())
    const result = await openPosOrder(auth.actor, data)
    return NextResponse.json({ success: true, data: result }, { status: result.created ? 201 : 200 })
  } catch (error) {
    return handleRouteError(error, 'pos.open')
  }
}
