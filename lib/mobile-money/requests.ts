import { sql, withTransaction, type Tx } from '../db'
import { AppError, notFound } from '../errors'
import { applyClientPayment, formatFcfa, type AccountType } from '../domain/payments'
import {
  createMerchantPayment,
  getMerchantPayment,
  ProviderError,
  type ProviderPayment,
} from './geniuspay-client'
import { getMerchantContext, type MerchantContext } from './settings'

/**
 * Demandes de paiement Mobile Money envoyées aux clients d'une entreprise.
 *
 * Cycle de vie : creating → pending → paid | failed | expired | cancelled
 *
 * Règle de sécurité : une demande n'est JAMAIS imputée sur la foi d'un webhook
 * ou d'un retour navigateur. Le statut est toujours relu auprès de l'API
 * GeniusPay (identifiants de l'entreprise) avant imputation, puis l'imputation
 * se fait sous verrou de ligne : au plus un encaissement par demande (garanti
 * aussi en base par payments.mobile_money_payment_id UNIQUE).
 */

export type MobileMoneyStatus = 'creating' | 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled'

export type MobileMoneyRow = {
  id: string
  company_id: string
  client_id: string
  sales_order_id: string | null
  credit_note_id: string | null
  account_type: AccountType
  amount: string
  currency: string
  customer_phone: string | null
  description: string | null
  environment: 'sandbox' | 'production'
  provider_reference: string | null
  payment_url: string | null
  status: MobileMoneyStatus
  provider_status: string | null
  provider_method: string | null
  paid_amount: string | null
  paid_at: string | null
  applied_payment_id: string | null
  applied_at: string | null
  apply_error: string | null
  check_attempts: number
  last_checked_at: string | null
  expires_at: string | null
  created_by: string | null
  created_at: string
}

/** Au-delà, une demande jamais confirmée est considérée comme expirée. */
export const REQUEST_TTL_MS = 48 * 60 * 60 * 1000

/** URL publique de l'application (jamais déduite d'un en-tête envoyé par le client). */
export function appUrl(): string {
  return (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '')
}

const toCents = (v: unknown) => Math.round(Number(v || 0) * 100)
const fromCents = (c: number) => c / 100

/** Numéro ivoirien → format international sans « + » (2250700000000), ou null. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '')
  if (!/^\d{8,15}$/.test(digits)) return null
  if (digits.length === 10) return `225${digits}` // numéro local CI (10 chiffres)
  return digits
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

export type CreateRequestInput = {
  companyId: string
  userId: string
  salesOrderId?: string | null
  creditNoteId?: string | null
  accountType?: AccountType | null
  amount: number
  customerPhone?: string | null
}

type Target = {
  clientId: string
  clientName: string
  clientPhone: string | null
  salesOrderId: string | null
  creditNoteId: string | null
  accountType: AccountType
  remainingCents: number
  reservedCents: number
  description: string
}

async function resolveCreditTarget(tx: Tx, companyId: string, creditNoteId: string): Promise<Target> {
  const [note] = await tx.sql`
    SELECT cn.id, cn.client_id, cn.sales_order_id, cn.credit_number, cn.status,
           COALESCE(cn.account_type, 'product') AS account_type,
           cn.total_amount, COALESCE(cn.paid_amount, 0) AS paid_amount,
           c.name AS client_name, c.phone AS client_phone
    FROM credit_notes cn
    LEFT JOIN clients c ON c.id = cn.client_id
    WHERE cn.id = ${creditNoteId} AND cn.company_id = ${companyId}
    FOR UPDATE OF cn
  `
  if (!note) throw notFound('Créance')
  if (!note.client_id) throw new AppError(409, "Cette créance n'est liée à aucun client", 'NO_CLIENT')
  if (!['pending', 'partial', 'overdue'].includes(note.status)) {
    throw new AppError(409, 'Cette créance est déjà soldée ou passée en perte', 'CREDIT_CLOSED')
  }
  const accountType: AccountType = note.account_type === 'packaging' ? 'packaging' : 'product'
  const [reserved] = await tx.sql`
    SELECT COALESCE(SUM(amount), 0) AS total FROM mobile_money_payments
    WHERE company_id = ${companyId} AND status IN ('creating', 'pending')
      AND (credit_note_id = ${note.id}
           OR (${note.sales_order_id}::uuid IS NOT NULL AND sales_order_id = ${note.sales_order_id}::uuid
               AND credit_note_id IS NULL AND account_type = ${accountType}))
  `
  return {
    clientId: note.client_id,
    clientName: note.client_name,
    clientPhone: note.client_phone,
    salesOrderId: note.sales_order_id,
    creditNoteId: note.id,
    accountType,
    remainingCents: toCents(note.total_amount) - toCents(note.paid_amount),
    reservedCents: toCents(reserved.total),
    description: `Créance ${note.credit_number}`,
  }
}

async function resolveSaleTarget(
  tx: Tx,
  companyId: string,
  salesOrderId: string,
  requestedType: AccountType | null | undefined
): Promise<Target> {
  const [order] = await tx.sql`
    SELECT so.id, so.order_number, so.status, so.client_id,
           COALESCE(so.subtotal, 0) AS subtotal, COALESCE(so.paid_amount_products, 0) AS paid_products,
           COALESCE(so.packaging_total, 0) AS packaging_total, COALESCE(so.paid_amount_packaging, 0) AS paid_packaging,
           c.name AS client_name, c.phone AS client_phone
    FROM sales_orders so
    LEFT JOIN clients c ON c.id = so.client_id
    WHERE so.id = ${salesOrderId} AND so.company_id = ${companyId}
    FOR UPDATE OF so
  `
  if (!order) throw notFound('Vente')
  if (order.status === 'cancelled') throw new AppError(409, 'Cette vente est annulée', 'SALE_CANCELLED')
  if (!order.client_id) {
    throw new AppError(409, 'Vente sans client enregistré : impossible de suivre une dette Mobile Money', 'NO_CLIENT')
  }

  // Reste dû par compte : créances ouvertes de la vente, sinon (données
  // anciennes sans créance) sous-total moins encaissé.
  const notes = await tx.sql`
    SELECT COALESCE(account_type, 'product') AS account_type,
           COUNT(*)::int AS n,
           COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) AS remaining
    FROM credit_notes
    WHERE company_id = ${companyId} AND sales_order_id = ${salesOrderId}
      AND status IN ('pending', 'partial', 'overdue') AND total_amount > COALESCE(paid_amount, 0)
    GROUP BY COALESCE(account_type, 'product')
  `
  const [anyNote] = await tx.sql`
    SELECT 1 AS x FROM credit_notes WHERE company_id = ${companyId} AND sales_order_id = ${salesOrderId} LIMIT 1
  `
  const remainingFor = (type: AccountType) => {
    const row = notes.find((n) => n.account_type === type)
    if (row) return toCents(row.remaining)
    if (anyNote) return 0
    return type === 'product'
      ? toCents(order.subtotal) - toCents(order.paid_products)
      : toCents(order.packaging_total) - toCents(order.paid_packaging)
  }
  const accountType: AccountType =
    requestedType ?? (remainingFor('product') > 0 ? 'product' : 'packaging')

  const [reserved] = await tx.sql`
    SELECT COALESCE(SUM(m.amount), 0) AS total FROM mobile_money_payments m
    LEFT JOIN credit_notes cn ON cn.id = m.credit_note_id
    WHERE m.company_id = ${companyId} AND m.status IN ('creating', 'pending') AND m.account_type = ${accountType}
      AND (m.sales_order_id = ${salesOrderId} OR cn.sales_order_id = ${salesOrderId})
  `
  return {
    clientId: order.client_id,
    clientName: order.client_name,
    clientPhone: order.client_phone,
    salesOrderId: order.id,
    creditNoteId: null,
    accountType,
    remainingCents: Math.max(remainingFor(accountType), 0),
    reservedCents: toCents(reserved.total),
    description: `Vente ${order.order_number}${accountType === 'packaging' ? ' (emballages)' : ''}`,
  }
}

export async function createPaymentRequest(input: CreateRequestInput): Promise<MobileMoneyRow> {
  if (!input.salesOrderId === !input.creditNoteId) {
    throw new AppError(400, 'Indiquez une vente ou une créance (une seule)', 'BAD_TARGET')
  }
  const amountCents = Math.round(input.amount * 100)
  if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents % 100 !== 0) {
    throw new AppError(400, 'Le montant doit être un nombre entier de FCFA, supérieur à 0', 'INVALID_AMOUNT')
  }
  let phone: string | null = null
  if (input.customerPhone) {
    phone = normalizePhone(input.customerPhone)
    if (!phone) throw new AppError(400, 'Numéro de téléphone du client invalide', 'INVALID_PHONE')
  }

  // Refuse tôt si l'entreprise n'a pas configuré / activé ses identifiants
  const merchant = await getMerchantContext(input.companyId)

  const { row, target } = await withTransaction(async (tx) => {
    const target = input.creditNoteId
      ? await resolveCreditTarget(tx, input.companyId, input.creditNoteId)
      : await resolveSaleTarget(tx, input.companyId, input.salesOrderId!, input.accountType)

    if (target.remainingCents <= 0) {
      throw new AppError(409, 'Aucun reste à payer sur ce compte', 'NO_DEBT')
    }
    const available = target.remainingCents - target.reservedCents
    if (amountCents > available) {
      throw new AppError(
        409,
        target.reservedCents > 0
          ? `Montant supérieur au reste dû disponible (${formatFcfa(fromCents(Math.max(available, 0)))} : ${formatFcfa(fromCents(target.reservedCents))} déjà demandés par Mobile Money en attente)`
          : `Montant supérieur au reste dû (${formatFcfa(fromCents(target.remainingCents))})`,
        'AMOUNT_EXCEEDS_DEBT'
      )
    }

    const [row] = await tx.sql<MobileMoneyRow>`
      INSERT INTO mobile_money_payments (
        company_id, client_id, sales_order_id, credit_note_id, account_type, amount,
        customer_phone, description, environment, status, created_by
      ) VALUES (
        ${input.companyId}, ${target.clientId}, ${target.salesOrderId}, ${target.creditNoteId},
        ${target.accountType}, ${fromCents(amountCents)}, ${phone ?? normalizePhone(target.clientPhone)},
        ${target.description}, ${merchant.environment}, 'creating', ${input.userId}
      )
      RETURNING *
    `
    return { row, target }
  })

  // Appel au prestataire hors transaction (aucun verrou tenu pendant le réseau)
  const base = appUrl()
  let provider: ProviderPayment
  try {
    provider = await createMerchantPayment(merchant.credentials, {
      amount: fromCents(amountCents),
      description: target.description,
      customerName: target.clientName || undefined,
      customerPhone: row.customer_phone ? `+${row.customer_phone}` : undefined,
      successUrl: `${base}/paiement?statut=succes`,
      errorUrl: `${base}/paiement?statut=echec`,
      metadata: {
        bstockPaymentId: row.id,
        companyId: input.companyId,
        source: 'bstock-mobile-money',
      },
    })
  } catch (e) {
    await sql`DELETE FROM mobile_money_payments WHERE id = ${row.id} AND status = 'creating'`
    console.error('[mobile-money] création refusée', e)
    if (e instanceof ProviderError && (e.status === 401 || e.status === 403)) {
      throw new AppError(502, 'GeniusPay a refusé les identifiants de votre entreprise. Le propriétaire doit les vérifier dans les paramètres.', 'PAYMENT_PROVIDER_AUTH')
    }
    throw new AppError(502, 'Le prestataire de paiement n’a pas pu créer la demande. Réessayez dans un instant.', 'PAYMENT_PROVIDER')
  }

  const url = provider?.checkout_url || provider?.payment_url
  if (!url || !provider?.reference) {
    await sql`DELETE FROM mobile_money_payments WHERE id = ${row.id} AND status = 'creating'`
    console.error('[mobile-money] réponse incomplète du prestataire', provider)
    throw new AppError(502, 'Le prestataire de paiement n’a pas répondu correctement', 'PAYMENT_PROVIDER')
  }
  const expiresAt = provider.expires_at && !Number.isNaN(Date.parse(provider.expires_at)) ? provider.expires_at : null

  const [updated] = await sql`
    UPDATE mobile_money_payments SET
      status = 'pending', provider_reference = ${String(provider.reference)}, payment_url = ${url},
      provider_status = ${provider.status ?? 'pending'}, expires_at = ${expiresAt}, updated_at = NOW()
    WHERE id = ${row.id}
    RETURNING *
  `
  return updated as MobileMoneyRow
}

// ---------------------------------------------------------------------------
// Rapprochement
// ---------------------------------------------------------------------------

export type ReconcileSource = 'webhook' | 'manual' | 'cron'

export type ReconcileOutcome = {
  status: MobileMoneyStatus
  applied: boolean
  /** Payé mais non imputé (dette déjà soldée, incohérence…) : à traiter à la main. */
  applyError: string | null
  message?: string
}

const NORMALIZED: Record<string, 'completed' | 'failed' | 'expired' | 'pending'> = {
  completed: 'completed',
  success: 'completed',
  succeeded: 'completed',
  paid: 'completed',
  failed: 'failed',
  refused: 'failed',
  error: 'failed',
  expired: 'expired',
  cancelled: 'expired',
  canceled: 'expired',
  pending: 'pending',
  processing: 'pending',
  initiated: 'pending',
}

export function normalizeProviderStatus(status: unknown): 'completed' | 'failed' | 'expired' | 'pending' {
  return NORMALIZED[String(status ?? '').toLowerCase()] ?? 'pending'
}

async function loadRequest(id: string, companyId?: string): Promise<MobileMoneyRow | null> {
  const rows = companyId
    ? await sql`SELECT * FROM mobile_money_payments WHERE id = ${id} AND company_id = ${companyId}`
    : await sql`SELECT * FROM mobile_money_payments WHERE id = ${id}`
  return (rows[0] as MobileMoneyRow | undefined) ?? null
}

/** Utilisateur au nom duquel l'encaissement est enregistré (créateur, sinon propriétaire). */
async function receiverFor(tx: Tx, row: MobileMoneyRow): Promise<string> {
  if (row.created_by) return row.created_by
  const [owner] = await tx.sql`
    SELECT id FROM users WHERE company_id = ${row.company_id} AND role = 'owner' ORDER BY created_at ASC LIMIT 1
  `
  if (!owner) throw new AppError(409, 'Aucun utilisateur pour enregistrer l’encaissement', 'NO_RECEIVER')
  return owner.id
}

const METHOD_LABELS: Record<string, string> = {
  wave: 'Wave',
  orange_money: 'Orange Money',
  orange: 'Orange Money',
  mtn_money: 'MTN MoMo',
  mtn: 'MTN MoMo',
  momo: 'MTN MoMo',
  moov_money: 'Moov Money',
  moov: 'Moov Money',
}

/**
 * Marque la demande payée et l'impute (une seule fois). Le paiement doit avoir
 * été vérifié auprès de l'API au préalable (ou la demande déjà marquée payée).
 */
async function markPaidAndApply(
  id: string,
  verified: { amount: number; method: string | null; completedAt: string | null } | null
): Promise<ReconcileOutcome> {
  return withTransaction(async (tx) => {
    const [row] = await tx.sql<MobileMoneyRow>`SELECT * FROM mobile_money_payments WHERE id = ${id} FOR UPDATE`
    if (!row) throw notFound('Demande de paiement')
    if (row.applied_payment_id) {
      return { status: 'paid', applied: false, applyError: null, message: 'Déjà imputé' }
    }

    if (verified) {
      await tx.sql`
        UPDATE mobile_money_payments SET
          status = 'paid', paid_amount = ${verified.amount}, provider_method = ${verified.method},
          paid_at = COALESCE(${verified.completedAt}::timestamp, NOW()), updated_at = NOW()
        WHERE id = ${id}
      `
    } else if (row.status !== 'paid') {
      return { status: row.status, applied: false, applyError: row.apply_error }
    }

    const methodLabel = row.provider_method || verified?.method
    const notes = [
      `Paiement Mobile Money GeniusPay${methodLabel ? ` (${METHOD_LABELS[methodLabel.toLowerCase()] ?? methodLabel})` : ''}`,
      row.environment === 'sandbox' ? 'mode test' : null,
    ]
      .filter(Boolean)
      .join(' — ')

    // L'imputation peut échouer pour une raison métier (dette soldée entre-temps
    // en espèces…) : l'argent est bien reçu, la demande reste « payée » avec un
    // motif, sans annuler le marquage.
    await tx.sql`SAVEPOINT mm_apply`
    try {
      const result = await applyClientPayment(tx, {
        companyId: row.company_id,
        clientId: row.client_id,
        amount: Number(row.amount),
        accountType: row.account_type,
        method: 'mobile_money',
        reference: row.provider_reference,
        notes,
        userId: await receiverFor(tx, row),
        salesOrderId: row.sales_order_id,
        creditNoteId: row.credit_note_id,
      })
      // Contrainte UNIQUE : une demande ne peut produire qu'un seul encaissement
      await tx.sql`UPDATE payments SET mobile_money_payment_id = ${row.id} WHERE id = ${result.payment.id}`
      await tx.sql`
        UPDATE mobile_money_payments SET
          applied_payment_id = ${result.payment.id}, applied_at = NOW(), apply_error = NULL, updated_at = NOW()
        WHERE id = ${id}
      `
      await tx.sql`RELEASE SAVEPOINT mm_apply`
      return { status: 'paid', applied: true, applyError: null }
    } catch (e) {
      await tx.sql`ROLLBACK TO SAVEPOINT mm_apply`
      if (!(e instanceof AppError)) throw e
      const reason = `Paiement reçu mais non imputé : ${e.message}. À enregistrer manuellement.`
      await tx.sql`UPDATE mobile_money_payments SET apply_error = ${reason}, updated_at = NOW() WHERE id = ${id}`
      return { status: 'paid', applied: false, applyError: reason }
    }
  })
}

async function setPaidWithoutApplying(id: string, reason: string, verified: { amount: number; method: string | null }) {
  await sql`
    UPDATE mobile_money_payments SET
      status = 'paid', paid_amount = ${verified.amount}, provider_method = ${verified.method},
      paid_at = COALESCE(paid_at, NOW()), apply_error = ${reason}, updated_at = NOW()
    WHERE id = ${id} AND applied_payment_id IS NULL
  `
}

/**
 * Rapproche une demande avec son statut RÉEL chez GeniusPay. Idempotent.
 * - cron : seulement les demandes en attente ;
 * - webhook / manuel : aussi les demandes expirées ou annulées localement
 *   (le client a pu payer un lien que l'on croyait abandonné).
 */
export async function reconcileRequest(
  id: string,
  opts: { companyId?: string; source: ReconcileSource; merchant?: MerchantContext }
): Promise<ReconcileOutcome> {
  const row = await loadRequest(id, opts.companyId)
  if (!row) throw notFound('Demande de paiement')

  if (row.status === 'paid') {
    if (row.applied_payment_id) return { status: 'paid', applied: false, applyError: null }
    // Payée mais non imputée : nouvelle tentative (vérification déjà faite)
    if (opts.source === 'cron') return { status: 'paid', applied: false, applyError: row.apply_error }
    return markPaidAndApply(row.id, null)
  }
  if (row.status === 'creating' || row.status === 'failed' || !row.provider_reference) {
    return { status: row.status, applied: false, applyError: null }
  }
  if (opts.source === 'cron' && row.status !== 'pending') {
    return { status: row.status, applied: false, applyError: null }
  }

  const merchant = opts.merchant ?? (await getMerchantContext(row.company_id, { requireEnabled: false }))
  const payment = await getMerchantPayment(merchant.credentials, row.provider_reference)

  await sql`
    UPDATE mobile_money_payments SET
      provider_status = ${String(payment?.status ?? '')}, check_attempts = check_attempts + 1,
      last_checked_at = NOW(), updated_at = NOW()
    WHERE id = ${row.id}
  `

  // Le paiement renvoyé doit être CELUI de cette demande et de cette entreprise
  const meta = payment?.metadata ?? {}
  if (
    (payment?.reference && String(payment.reference) !== row.provider_reference) ||
    (meta.bstockPaymentId && meta.bstockPaymentId !== row.id) ||
    (meta.companyId && meta.companyId !== row.company_id)
  ) {
    console.error('[mobile-money] paiement incohérent avec la demande', row.id, payment?.reference)
    return { status: row.status, applied: false, applyError: null, message: 'Paiement non associé à cette demande' }
  }

  const state = normalizeProviderStatus(payment?.status)

  if (state === 'completed') {
    const verified = {
      amount: Number(payment.amount),
      method: payment.payment_method ? String(payment.payment_method).slice(0, 40) : null,
      completedAt: payment.completed_at && !Number.isNaN(Date.parse(payment.completed_at)) ? payment.completed_at : null,
    }
    if (!(verified.amount >= Number(row.amount)) || (payment.currency && payment.currency !== row.currency)) {
      const reason = `Montant ou devise incohérents (reçu ${verified.amount} ${payment.currency ?? ''}, attendu ${row.amount} ${row.currency}) : à vérifier avant imputation.`
      console.error('[mobile-money]', reason, row.id)
      await setPaidWithoutApplying(row.id, reason, verified)
      return { status: 'paid', applied: false, applyError: reason }
    }
    // Un paiement de test ne solde jamais une dette réelle
    const env = String(payment.environment ?? '').toLowerCase()
    if (row.environment === 'production' && (env === 'sandbox' || env === 'test')) {
      const reason = 'Paiement effectué en mode test alors que l’entreprise est en production : non imputé.'
      await setPaidWithoutApplying(row.id, reason, verified)
      return { status: 'paid', applied: false, applyError: reason }
    }
    return markPaidAndApply(row.id, verified)
  }

  if (state === 'failed') {
    await sql`
      UPDATE mobile_money_payments SET status = 'failed', updated_at = NOW()
      WHERE id = ${row.id} AND status IN ('pending', 'expired', 'cancelled')
    `
    return { status: 'failed', applied: false, applyError: null }
  }

  const tooOld =
    Date.now() - new Date(row.created_at).getTime() > REQUEST_TTL_MS ||
    (row.expires_at !== null && new Date(row.expires_at).getTime() < Date.now() - 5 * 60_000)
  if (state === 'expired' || (row.status === 'pending' && tooOld)) {
    await sql`
      UPDATE mobile_money_payments SET status = 'expired', updated_at = NOW()
      WHERE id = ${row.id} AND status = 'pending'
    `
    return { status: row.status === 'cancelled' ? 'cancelled' : 'expired', applied: false, applyError: null }
  }

  return { status: row.status, applied: false, applyError: null }
}

/** Annulation locale d'une demande en attente (le lien GeniusPay peut rester payable). */
export async function cancelPaymentRequest(id: string, companyId: string): Promise<MobileMoneyRow> {
  const [row] = await sql`
    UPDATE mobile_money_payments SET status = 'cancelled', updated_at = NOW()
    WHERE id = ${id} AND company_id = ${companyId} AND status = 'pending'
    RETURNING *
  `
  if (!row) {
    const existing = await loadRequest(id, companyId)
    if (!existing) throw notFound('Demande de paiement')
    throw new AppError(409, 'Seule une demande en attente peut être annulée', 'NOT_PENDING')
  }
  return row as MobileMoneyRow
}

/** Rapproche les demandes encore en attente (cron) : couvre les webhooks perdus. */
export async function reconcilePendingRequests(
  limit = 50
): Promise<{ checked: number; paid: number; applied: number; failed: number; expired: number; errors: number }> {
  const pending = await sql`
    SELECT id, company_id FROM mobile_money_payments
    WHERE status = 'pending' AND provider_reference IS NOT NULL AND created_at > NOW() - INTERVAL '7 days'
    ORDER BY last_checked_at ASC NULLS FIRST
    LIMIT ${limit}
  `
  const summary = { checked: 0, paid: 0, applied: 0, failed: 0, expired: 0, errors: 0 }
  const merchants = new Map<string, MerchantContext | null>()
  for (const p of pending) {
    summary.checked++
    try {
      if (!merchants.has(p.company_id)) {
        merchants.set(
          p.company_id,
          await getMerchantContext(p.company_id, { requireEnabled: false }).catch(() => null)
        )
      }
      const merchant = merchants.get(p.company_id)
      if (!merchant) {
        summary.errors++
        continue
      }
      const r = await reconcileRequest(p.id, { source: 'cron', merchant })
      if (r.status === 'paid') summary.paid++
      if (r.applied) summary.applied++
      if (r.status === 'failed') summary.failed++
      if (r.status === 'expired') summary.expired++
    } catch (e) {
      summary.errors++
      console.error('[mobile-money] rapprochement échoué', p.id, e)
    }
  }
  return summary
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export type ListFilters = {
  status?: MobileMoneyStatus | null
  from?: string | null
  to?: string | null
  salesOrderId?: string | null
  creditNoteId?: string | null
  limit?: number
  offset?: number
}

export async function listPaymentRequests(companyId: string, f: ListFilters = {}) {
  const limit = Math.min(Math.max(f.limit ?? 100, 1), 500)
  const offset = Math.max(f.offset ?? 0, 0)
  const rows = await sql`
    SELECT m.id, m.client_id, m.sales_order_id, m.credit_note_id, m.account_type, m.amount, m.currency,
           m.customer_phone, m.description, m.environment, m.provider_reference, m.payment_url, m.status,
           m.provider_method, m.paid_amount, m.paid_at, m.applied_payment_id, m.applied_at, m.apply_error,
           m.last_checked_at, m.expires_at, m.created_at,
           c.name AS client_name, so.order_number, cn.credit_number, u.full_name AS created_by_name,
           co.name AS company_name
    FROM mobile_money_payments m
    LEFT JOIN clients c ON c.id = m.client_id
    LEFT JOIN sales_orders so ON so.id = m.sales_order_id
    LEFT JOIN credit_notes cn ON cn.id = m.credit_note_id
    LEFT JOIN users u ON u.id = m.created_by
    LEFT JOIN companies co ON co.id = m.company_id
    WHERE m.company_id = ${companyId}
      AND m.status <> 'creating'
      AND (${f.status ?? null}::text IS NULL OR m.status = ${f.status ?? null}::text)
      AND (${f.from ?? null}::date IS NULL OR m.created_at >= ${f.from ?? null}::date)
      AND (${f.to ?? null}::date IS NULL OR m.created_at < ${f.to ?? null}::date + INTERVAL '1 day')
      AND (${f.salesOrderId ?? null}::uuid IS NULL OR m.sales_order_id = ${f.salesOrderId ?? null}::uuid)
      AND (${f.creditNoteId ?? null}::uuid IS NULL OR m.credit_note_id = ${f.creditNoteId ?? null}::uuid)
    ORDER BY m.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
  const [totals] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
      COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS pending_amount,
      COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_count,
      COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS paid_amount,
      COUNT(*) FILTER (WHERE status = 'paid' AND applied_payment_id IS NULL)::int AS unapplied_count
    FROM mobile_money_payments
    WHERE company_id = ${companyId} AND status <> 'creating'
      AND (${f.from ?? null}::date IS NULL OR created_at >= ${f.from ?? null}::date)
      AND (${f.to ?? null}::date IS NULL OR created_at < ${f.to ?? null}::date + INTERVAL '1 day')
  `
  return { rows, totals }
}

export async function getPaymentRequest(id: string, companyId: string) {
  const [row] = await sql`
    SELECT m.id, m.client_id, m.sales_order_id, m.credit_note_id, m.account_type, m.amount, m.currency,
           m.customer_phone, m.description, m.environment, m.provider_reference, m.payment_url, m.status,
           m.provider_method, m.paid_amount, m.paid_at, m.applied_payment_id, m.applied_at, m.apply_error,
           m.last_checked_at, m.expires_at, m.created_at,
           c.name AS client_name, so.order_number, cn.credit_number,
           co.name AS company_name
    FROM mobile_money_payments m
    LEFT JOIN clients c ON c.id = m.client_id
    LEFT JOIN sales_orders so ON so.id = m.sales_order_id
    LEFT JOIN credit_notes cn ON cn.id = m.credit_note_id
    LEFT JOIN companies co ON co.id = m.company_id
    WHERE m.id = ${id} AND m.company_id = ${companyId}
  `
  if (!row) throw notFound('Demande de paiement')
  return row
}
