import { randomBytes } from 'node:crypto'
import { sql } from '../db'
import { AppError } from '../errors'
import {
  CredentialsKeyMissingError,
  decryptSecret,
  encryptSecret,
  isSecretsKeyConfigured,
  lastFour,
} from '../crypto/secrets'
import type { MerchantCredentials } from './geniuspay-client'

/**
 * Paramètres Mobile Money d'une entreprise (identifiants GeniusPay chiffrés).
 * Les secrets ne quittent JAMAIS le serveur : la vue publique n'expose que
 * « configuré ••••1234 ».
 */

export type PaymentEnvironment = 'sandbox' | 'production'

type SettingsRow = {
  company_id: string
  enabled: boolean
  environment: PaymentEnvironment
  api_key_enc: string | null
  api_key_last4: string | null
  api_secret_enc: string | null
  api_secret_last4: string | null
  webhook_secret_enc: string | null
  webhook_secret_last4: string | null
  webhook_token: string
  last_tested_at: string | null
  last_test_ok: boolean | null
  last_test_message: string | null
  updated_at: string | null
}

export type SecretStatus = { configured: boolean; last4: string | null }

/** Vue sûre pour le navigateur : aucun secret, même chiffré. */
export type PublicPaymentSettings = {
  provider: 'geniuspay'
  enabled: boolean
  environment: PaymentEnvironment
  apiKey: SecretStatus
  apiSecret: SecretStatus
  webhookSecret: SecretStatus
  webhookPath: string
  lastTest: { at: string | null; ok: boolean | null; message: string | null }
  keyConfigured: boolean
  ready: boolean
  updatedAt: string | null
}

export function newWebhookToken(): string {
  return randomBytes(24).toString('base64url')
}

export function webhookPath(token: string): string {
  return `/api/payments/mobile-money/webhook/${token}`
}

/** Contexte AAD : un chiffré n'est valable que pour cette entreprise et ce champ. */
const ctx = (companyId: string, field: string) => `company:${companyId}:geniuspay:${field}`

async function loadRow(companyId: string): Promise<SettingsRow | null> {
  const [row] = await sql`SELECT * FROM company_payment_settings WHERE company_id = ${companyId}`
  return (row as SettingsRow | undefined) ?? null
}

function status(enc: string | null, last4: string | null): SecretStatus {
  return { configured: Boolean(enc), last4: enc ? last4 : null }
}

function hasAllSecrets(row: SettingsRow | null): boolean {
  return Boolean(row?.api_key_enc && row?.api_secret_enc && row?.webhook_secret_enc)
}

export function toPublic(row: SettingsRow | null, token: string): PublicPaymentSettings {
  const keyConfigured = isSecretsKeyConfigured()
  return {
    provider: 'geniuspay',
    enabled: Boolean(row?.enabled),
    environment: row?.environment ?? 'sandbox',
    apiKey: status(row?.api_key_enc ?? null, row?.api_key_last4 ?? null),
    apiSecret: status(row?.api_secret_enc ?? null, row?.api_secret_last4 ?? null),
    webhookSecret: status(row?.webhook_secret_enc ?? null, row?.webhook_secret_last4 ?? null),
    webhookPath: webhookPath(token),
    lastTest: { at: row?.last_tested_at ?? null, ok: row?.last_test_ok ?? null, message: row?.last_test_message ?? null },
    keyConfigured,
    ready: keyConfigured && Boolean(row?.enabled) && hasAllSecrets(row),
    updatedAt: row?.updated_at ?? null,
  }
}

/** Crée la ligne au besoin (jeton de webhook généré une fois). */
async function ensureRow(companyId: string): Promise<SettingsRow> {
  await sql`
    INSERT INTO company_payment_settings (company_id, webhook_token)
    VALUES (${companyId}, ${newWebhookToken()})
    ON CONFLICT (company_id) DO NOTHING
  `
  return (await loadRow(companyId))!
}

export async function getPublicSettings(companyId: string): Promise<PublicPaymentSettings> {
  const row = await ensureRow(companyId)
  return toPublic(row, row.webhook_token)
}

export type SaveSettingsInput = {
  enabled?: boolean
  environment?: PaymentEnvironment
  apiKey?: string | null
  apiSecret?: string | null
  webhookSecret?: string | null
  regenerateWebhookToken?: boolean
  userId: string
}

/**
 * Enregistre les paramètres. Un secret vide ou absent = conservé tel quel ;
 * une nouvelle valeur remplace l'ancienne (chiffrée).
 */
export async function savePaymentSettings(companyId: string, input: SaveSettingsInput): Promise<PublicPaymentSettings> {
  const providesSecret = Boolean(input.apiKey || input.apiSecret || input.webhookSecret)
  if ((providesSecret || input.enabled) && !isSecretsKeyConfigured()) {
    throw new CredentialsKeyMissingError()
  }

  const current = await ensureRow(companyId)
  const enc = (value: string | null | undefined, field: string) =>
    value ? { enc: encryptSecret(value, ctx(companyId, field)), last4: lastFour(value) } : null

  const apiKey = enc(input.apiKey, 'api_key')
  const apiSecret = enc(input.apiSecret, 'api_secret')
  const webhookSecret = enc(input.webhookSecret, 'webhook_secret')

  const next = {
    api_key_enc: apiKey?.enc ?? current.api_key_enc,
    api_secret_enc: apiSecret?.enc ?? current.api_secret_enc,
    webhook_secret_enc: webhookSecret?.enc ?? current.webhook_secret_enc,
  }
  const enabled = input.enabled ?? current.enabled
  if (enabled && !(next.api_key_enc && next.api_secret_enc && next.webhook_secret_enc)) {
    throw new AppError(
      400,
      'Renseignez la clé API, le secret API et le secret de webhook avant d’activer les paiements Mobile Money.',
      'PAYMENT_SETTINGS_INCOMPLETE'
    )
  }
  const credentialsChanged = Boolean(apiKey || apiSecret)

  await sql`
    UPDATE company_payment_settings SET
      enabled = ${enabled},
      environment = ${input.environment ?? current.environment},
      api_key_enc = ${next.api_key_enc},
      api_key_last4 = ${apiKey?.last4 ?? current.api_key_last4},
      api_secret_enc = ${next.api_secret_enc},
      api_secret_last4 = ${apiSecret?.last4 ?? current.api_secret_last4},
      webhook_secret_enc = ${next.webhook_secret_enc},
      webhook_secret_last4 = ${webhookSecret?.last4 ?? current.webhook_secret_last4},
      webhook_token = ${input.regenerateWebhookToken ? newWebhookToken() : current.webhook_token},
      last_tested_at = CASE WHEN ${credentialsChanged} THEN NULL ELSE last_tested_at END,
      last_test_ok = CASE WHEN ${credentialsChanged} THEN NULL ELSE last_test_ok END,
      last_test_message = CASE WHEN ${credentialsChanged} THEN NULL ELSE last_test_message END,
      updated_by = ${input.userId},
      updated_at = NOW()
    WHERE company_id = ${companyId}
  `
  return getPublicSettings(companyId)
}

export async function recordConnectionTest(companyId: string, ok: boolean, message: string): Promise<void> {
  await sql`
    UPDATE company_payment_settings
    SET last_tested_at = NOW(), last_test_ok = ${ok}, last_test_message = ${message}
    WHERE company_id = ${companyId}
  `
}

export type MerchantContext = {
  companyId: string
  environment: PaymentEnvironment
  credentials: MerchantCredentials
}

/**
 * Identifiants déchiffrés (usage serveur uniquement).
 * `requireEnabled` : refuse si l'entreprise a désactivé la fonctionnalité
 * (création de demandes). Le rapprochement des demandes déjà émises reste
 * possible même après désactivation.
 */
export async function getMerchantContext(
  companyId: string,
  { requireEnabled = true }: { requireEnabled?: boolean } = {}
): Promise<MerchantContext> {
  const row = await loadRow(companyId)
  if (!row || !hasAllSecrets(row)) {
    throw new AppError(
      409,
      'Les paiements Mobile Money ne sont pas configurés. Le propriétaire doit renseigner ses identifiants GeniusPay dans Paramètres > Paiements Mobile Money.',
      'MOBILE_MONEY_NOT_CONFIGURED'
    )
  }
  if (requireEnabled && !row.enabled) {
    throw new AppError(409, 'Les paiements Mobile Money sont désactivés pour votre entreprise.', 'MOBILE_MONEY_DISABLED')
  }
  return {
    companyId,
    environment: row.environment,
    credentials: {
      apiKey: decryptSecret(row.api_key_enc!, ctx(companyId, 'api_key')),
      apiSecret: decryptSecret(row.api_secret_enc!, ctx(companyId, 'api_secret')),
    },
  }
}

/** Entreprise + secret de webhook déchiffré à partir du jeton opaque de l'URL. */
export async function findWebhookTarget(token: string): Promise<{ companyId: string; webhookSecret: string } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null
  const [row] = await sql`
    SELECT company_id, webhook_secret_enc FROM company_payment_settings WHERE webhook_token = ${token}
  `
  if (!row || !row.webhook_secret_enc) return null
  return {
    companyId: row.company_id,
    webhookSecret: decryptSecret(row.webhook_secret_enc, ctx(row.company_id, 'webhook_secret')),
  }
}

/** Disponibilité pour les écrans de vente / créances (sans aucun secret). */
export async function getAvailability(companyId: string): Promise<{ enabled: boolean; environment: PaymentEnvironment }> {
  const row = await loadRow(companyId)
  return {
    enabled: isSecretsKeyConfigured() && Boolean(row?.enabled) && hasAllSecrets(row),
    environment: row?.environment ?? 'sandbox',
  }
}
