import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/errors'
import { recordOfflinePosSale } from '@/lib/offline/pos-sync'
import { requirePosActor } from '@/lib/pos-auth'

const schema = z.object({
  clientRequestId: z.string().uuid(),
  depotId: z.string().uuid(),
  posOrderId: z.string().uuid().nullish(),
  label: z.string().max(100).nullish(),
  // Hors ligne : uniquement au comptant (l'ardoise exige le contrôle du plafond par le serveur)
  paymentMethod: z.enum(['cash', 'mobile_money']),
  soldAt: z.string().datetime({ offset: true }).nullish(),
  acceptCurrentPrices: z.boolean().optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().positive().max(100_000),
        unitPrice: z.number().min(0).max(1e9),
      })
    )
    .min(1, 'La vente est vide')
    .max(200),
})

// POST /api/pos/offline-sales — envoi d'une vente du point de vente saisie hors ligne.
// Idempotent : la même clé renvoie la vente déjà créée (200) au lieu d'en créer une seconde.
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePosActor()
    if (!auth.ok) return auth.response
    const result = await recordOfflinePosSale(auth.actor, schema.parse(await request.json()))
    return NextResponse.json(
      { success: true, data: result, warnings: result.warnings, replayed: result.replayed },
      { status: result.replayed ? 200 : 201 }
    )
  } catch (error) {
    return handleRouteError(error, 'pos.offline-sale')
  }
}
