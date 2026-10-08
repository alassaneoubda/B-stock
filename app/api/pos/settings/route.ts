import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getPosAutoUnpack, setPosAutoUnpack } from '@/lib/domain/pos'
import { forbidden, handleRouteError } from '@/lib/errors'
import { requirePosActor } from '@/lib/pos-auth'

const schema = z.object({ autoUnpack: z.boolean() })

// GET /api/pos/settings — réglages du point de vente
export async function GET() {
  try {
    const auth = await requirePosActor()
    if (!auth.ok) return auth.response
    return NextResponse.json({ success: true, data: { autoUnpack: await getPosAutoUnpack(auth.actor.companyId) } })
  } catch (error) {
    return handleRouteError(error, 'pos.settings.get')
  }
}

// PATCH /api/pos/settings — { autoUnpack } : ouvrir automatiquement un casier (gérant)
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requirePosActor()
    if (!auth.ok) return auth.response
    if (!auth.actor.canManage) throw forbidden('Seul un gérant peut modifier les réglages du point de vente')
    const { autoUnpack } = schema.parse(await request.json())
    await setPosAutoUnpack(auth.actor.companyId, autoUnpack)
    return NextResponse.json({ success: true, data: { autoUnpack } })
  } catch (error) {
    return handleRouteError(error, 'pos.settings.update')
  }
}
