import { NextRequest, NextResponse } from 'next/server'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { handleMerchantWebhook } from '@/lib/mobile-money/webhook'

export const dynamic = 'force-dynamic'

/**
 * POST /api/payments/mobile-money/webhook/[companyToken]
 * Webhook GeniusPay du compte marchand d'une entreprise (non authentifié par
 * session : exempté dans proxy.ts, authentifié par signature HMAC).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ companyToken: string }> }) {
  const { companyToken } = await params
  const limited = await rateLimit('mm-webhook', `${companyToken.slice(0, 64)}:${clientIp(request.headers)}`, {
    limit: 120,
    windowSeconds: 60,
  })
  if (limited) return limited

  const rawBody = await request.text()
  const result = await handleMerchantWebhook({ token: companyToken, rawBody, headers: request.headers })
  return NextResponse.json(result.body, { status: result.status })
}
