import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/api-auth'
import { handleRouteError } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import { testMerchantCredentials } from '@/lib/mobile-money/geniuspay-client'
import { getMerchantContext, getPublicSettings, recordConnectionTest } from '@/lib/mobile-money/settings'

// POST /api/settings/payments/test — « Tester la connexion » avec les identifiants enregistrés
export async function POST() {
  try {
    const authz = await requireOwner()
    if (!authz.ok) return authz.response
    const limited = await rateLimit('payment-settings-test', authz.companyId, { limit: 10, windowSeconds: 600 })
    if (limited) return limited

    const merchant = await getMerchantContext(authz.companyId, { requireEnabled: false })
    const result = await testMerchantCredentials(merchant.credentials)

    let message = result.message
    const env = result.environment?.toLowerCase()
    if (result.ok && env) {
      const looksSandbox = env === 'sandbox' || env === 'test'
      if (looksSandbox !== (merchant.environment === 'sandbox')) {
        message += ` Attention : GeniusPay indique l’environnement « ${result.environment} », différent du mode choisi.`
      }
    }
    await recordConnectionTest(authz.companyId, result.ok, message)
    return NextResponse.json({
      success: true,
      data: { ok: result.ok, message, settings: await getPublicSettings(authz.companyId) },
    })
  } catch (error) {
    return handleRouteError(error, 'settings.payments.test')
  }
}
