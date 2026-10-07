import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwner } from '@/lib/api-auth'
import { AppError, handleRouteError } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import { getPublicSettings, savePaymentSettings } from '@/lib/mobile-money/settings'

/**
 * Paramètres Mobile Money (propriétaire uniquement).
 * Les secrets sont acceptés en écriture, chiffrés, et JAMAIS renvoyés :
 * la réponse n'indique que « configuré ••••1234 ».
 */

// GET /api/settings/payments
export async function GET() {
  try {
    const authz = await requireOwner()
    if (!authz.ok) return authz.response
    return NextResponse.json({ success: true, data: await getPublicSettings(authz.companyId) })
  } catch (error) {
    return handleRouteError(error, 'settings.payments.get')
  }
}

const secret = z
  .string()
  .trim()
  .max(255, 'Valeur trop longue')
  .refine((v) => v === '' || (v.length >= 8 && !/\s/.test(v)), 'Valeur invalide (8 caractères minimum, sans espace)')
  .optional()
  .nullable()

const schema = z.object({
  enabled: z.boolean().optional(),
  environment: z.enum(['sandbox', 'production']).optional(),
  apiKey: secret,
  apiSecret: secret,
  webhookSecret: secret,
  regenerateWebhookToken: z.boolean().optional(),
})

// PUT /api/settings/payments
export async function PUT(request: NextRequest) {
  try {
    const authz = await requireOwner()
    if (!authz.ok) return authz.response
    if (authz.isImpersonating) {
      throw new AppError(403, 'Modification des identifiants de paiement impossible en mode assistance', 'IMPERSONATION')
    }
    const limited = await rateLimit('payment-settings', authz.companyId, { limit: 20, windowSeconds: 600 })
    if (limited) return limited

    const data = schema.parse(await request.json())
    const settings = await savePaymentSettings(authz.companyId, {
      enabled: data.enabled,
      environment: data.environment,
      apiKey: data.apiKey || null,
      apiSecret: data.apiSecret || null,
      webhookSecret: data.webhookSecret || null,
      regenerateWebhookToken: data.regenerateWebhookToken,
      userId: authz.userId,
    })
    return NextResponse.json({ success: true, data: settings, message: 'Paramètres enregistrés' })
  } catch (error) {
    return handleRouteError(error, 'settings.payments.put')
  }
}
