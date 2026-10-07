import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { getPosAutoUnpack, getPosCatalog, getPosFloor, resolvePosDepot } from '@/lib/domain/pos'
import { handleRouteError } from '@/lib/errors'
import { requirePosActor } from '@/lib/pos-auth'

// GET /api/pos?depotId= — état complet du point de vente (salle + catalogue)
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePosActor()
    if (!auth.ok) return auth.response
    const { actor } = auth

    const requested = new URL(request.url).searchParams.get('depotId')
    const depotId = await resolvePosDepot(actor.companyId, requested)

    const [depots, floor, catalog, autoUnpack] = await Promise.all([
      sql`SELECT id, name, is_main FROM depots WHERE company_id = ${actor.companyId} ORDER BY is_main DESC, name`,
      getPosFloor(actor.companyId, depotId),
      getPosCatalog(actor.companyId, depotId),
      getPosAutoUnpack(actor.companyId),
    ])

    return NextResponse.json({
      success: true,
      data: { depotId, depots, canManage: actor.canManage, autoUnpack, ...floor, catalog },
    })
  } catch (error) {
    return handleRouteError(error, 'pos.state')
  }
}
