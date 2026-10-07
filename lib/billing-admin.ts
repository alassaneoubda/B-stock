import { randomUUID } from 'node:crypto'
import { sql, withTransaction } from './db'
import { AppError, badRequest, conflict, notFound } from './errors'
import { applySubscriptionPayment, fullPlanName } from './subscription'
import { nextPlatformNumber } from './cron-runs'

/**
 * Facturation du back-office : paiements manuels, remboursements, reçus et
 * indicateurs de revenu. Les fonctions cœur d'activation restent dans
 * lib/subscription.ts (applySubscriptionPayment) : on les réutilise ici.
 */

// ---------------------------------------------------------------------------
// Paiement manuel
// ---------------------------------------------------------------------------

export const MANUAL_METHODS = {
  cash: 'Espèces',
  transfer: 'Virement',
  mobile_money_offline: 'Mobile Money hors ligne',
  check: 'Chèque',
} as const

export type ManualMethod = keyof typeof MANUAL_METHODS

const MONTHS_TO_INTERVAL: Record<number, string> = { 1: 'monthly', 3: 'quarterly', 6: 'semiannual', 12: 'yearly' }

export type ManualPaymentInput = {
  companyId: string
  planId: string
  months: number
  amount: number
  method: ManualMethod
  reference?: string | null
  note?: string | null
  recordedBy: string
}

export type ManualPaymentResult = {
  paymentId: string
  receiptNumber: string
  endsAt: string | null
  reference: string
}

/**
 * Enregistre un paiement reçu hors ligne (espèces, virement…).
 * Même sémantique que les paiements en ligne : applySubscriptionPayment
 * prolonge l'abonnement à partir de la fin de la période en cours. Le reçu
 * (RC-000001…) et l'auteur sont ensuite posés sur la ligne de paiement.
 */
export async function recordManualPayment(input: ManualPaymentInput): Promise<ManualPaymentResult> {
  const [company] = await sql`SELECT id FROM companies WHERE id = ${input.companyId}`
  if (!company) throw notFound('Entreprise')

  const [plan] = await sql`
    SELECT name, display_name FROM subscription_plans WHERE name = ${input.planId} AND is_active = true
  `
  if (!plan) throw badRequest('Plan inconnu ou inactif')

  const reference = input.reference?.trim() ? input.reference.trim() : `manual:${randomUUID()}`
  const [dup] = await sql`SELECT id FROM subscription_payments WHERE reference = ${reference}`
  if (dup) throw conflict('Cette référence de paiement a déjà été enregistrée', 'DUPLICATE_REFERENCE')

  const planName = fullPlanName(String(plan.display_name || plan.name), MONTHS_TO_INTERVAL[input.months] ?? null)

  const result = await applySubscriptionPayment({
    companyId: input.companyId,
    planId: String(plan.name),
    planName,
    months: input.months,
    amount: input.amount,
    reference,
    provider: 'manual',
    metadata: {
      method: input.method,
      methodLabel: MANUAL_METHODS[input.method],
      note: input.note || null,
      recordedBy: input.recordedBy,
    },
  })
  if (!result.applied) throw conflict('Cette référence de paiement a déjà été enregistrée', 'DUPLICATE_REFERENCE')

  const receiptNumber = await nextPlatformNumber('subscription_receipt', 'RC')
  // Période couverte (pour le reçu) : fin renvoyée par l'activation − durée.
  let periodStart: string | null = null
  if (result.endsAt) {
    const start = new Date(result.endsAt)
    start.setMonth(start.getMonth() - input.months)
    periodStart = start.toISOString()
  }
  const [row] = await sql`
    UPDATE subscription_payments SET
      receipt_number = ${receiptNumber},
      recorded_by = ${input.recordedBy},
      metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ periodStart, periodEnd: result.endsAt })}::jsonb
    WHERE reference = ${reference}
    RETURNING id
  `
  return { paymentId: row.id as string, receiptNumber, endsAt: result.endsAt, reference }
}

// ---------------------------------------------------------------------------
// Remboursement
// ---------------------------------------------------------------------------

export type RefundResult = {
  paymentId: string
  companyId: string | null
  subscriptionEndsAt: string | null
  subscriptionStatus: string | null
  accessRevoked: boolean
}

function iso(v: unknown): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Rembourse un paiement complété (atomique, non rejouable).
 * Si `revokeAccess`, la période payée est retirée : subscription_ends_at recule
 * de `months` mois, sans jamais passer avant maintenant ; si la nouvelle fin
 * est atteinte (≤ maintenant), l'abonnement passe à « canceled ».
 * Le reversement des fonds reste à faire chez le prestataire.
 */
export async function refundPayment(input: { paymentId: string; reason: string; revokeAccess: boolean }): Promise<RefundResult> {
  return withTransaction(async (tx) => {
    const [p] = await tx.sql`
      SELECT id, company_id, status, months, amount FROM subscription_payments WHERE id = ${input.paymentId} FOR UPDATE
    `
    if (!p) throw notFound('Paiement')
    if (p.status === 'refunded') throw conflict('Ce paiement a déjà été remboursé', 'ALREADY_REFUNDED')
    if (p.status !== 'completed') throw new AppError(409, 'Seul un paiement complété peut être remboursé', 'NOT_COMPLETED')

    await tx.sql`
      UPDATE subscription_payments
      SET status = 'refunded', refunded_at = NOW(), refund_reason = ${input.reason}
      WHERE id = ${p.id}
    `

    let endsAt: string | null = null
    let status: string | null = null
    let revoked = false
    if (p.company_id) {
      const [c] = await tx.sql`
        SELECT subscription_ends_at, subscription_status FROM companies WHERE id = ${p.company_id} FOR UPDATE
      `
      endsAt = iso(c?.subscription_ends_at)
      status = c?.subscription_status ?? null
      const months = Number(p.months) || 0
      if (input.revokeAccess && c?.subscription_ends_at && months > 0) {
        // Les deux expressions lisent l'ancienne valeur de subscription_ends_at.
        const [u] = await tx.sql`
          UPDATE companies SET
            subscription_ends_at = GREATEST(subscription_ends_at - make_interval(months => ${months}::int), NOW()),
            subscription_status = CASE
              WHEN subscription_ends_at - make_interval(months => ${months}::int) <= NOW() THEN 'canceled'
              ELSE subscription_status END,
            updated_at = NOW()
          WHERE id = ${p.company_id}
          RETURNING subscription_ends_at, subscription_status
        `
        endsAt = iso(u.subscription_ends_at)
        status = u.subscription_status
        revoked = true
      }
    }
    return {
      paymentId: p.id as string,
      companyId: (p.company_id as string) ?? null,
      subscriptionEndsAt: endsAt,
      subscriptionStatus: status,
      accessRevoked: revoked,
    }
  })
}

// ---------------------------------------------------------------------------
// Reçus
// ---------------------------------------------------------------------------

/** Attribue un numéro de reçu s'il manque (sans écraser un numéro existant). */
export async function ensureReceiptNumber(paymentId: string): Promise<{ number: string; assigned: boolean }> {
  const [p] = await sql`SELECT receipt_number FROM subscription_payments WHERE id = ${paymentId}`
  if (!p) throw notFound('Paiement')
  if (p.receipt_number) return { number: p.receipt_number as string, assigned: false }
  const candidate = await nextPlatformNumber('subscription_receipt', 'RC')
  const updated = await sql`
    UPDATE subscription_payments SET receipt_number = ${candidate}
    WHERE id = ${paymentId} AND receipt_number IS NULL
    RETURNING receipt_number
  `
  if (updated.length > 0) return { number: candidate, assigned: true }
  // Attribué entre-temps par une requête concurrente
  const [again] = await sql`SELECT receipt_number FROM subscription_payments WHERE id = ${paymentId}`
  return { number: again.receipt_number as string, assigned: false }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  )
}

const money = (n: unknown) =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))} FCFA`
const dateFr = (v: unknown) => {
  const d = v ? new Date(String(v instanceof Date ? v.toISOString() : v)) : null
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Africa/Abidjan' })
    : '—'
}

export const PROVIDER_LABELS: Record<string, string> = {
  geniuspay: 'Mobile Money (GeniusPay)',
  manual: 'Paiement manuel',
  admin: 'Octroi administrateur',
}

export type ReceiptData = {
  platformName: string
  supportEmail?: string | null
  receiptNumber: string
  companyName: string
  planName: string
  months: number
  periodStart?: string | null
  periodEnd?: string | null
  amount: number
  currency: string
  method: string
  reference?: string | null
  paidAt: string | Date
  status: 'paid' | 'refunded'
  refundedAt?: string | Date | null
  refundReason?: string | null
}

/** Reçu imprimable (A4 et ticket 80 mm), toutes les valeurs sont échappées. */
export function renderReceiptHtml(r: ReceiptData): string {
  const refunded = r.status === 'refunded'
  const period =
    r.periodStart && r.periodEnd
      ? `Du ${dateFr(r.periodStart)} au ${dateFr(r.periodEnd)} (${r.months} mois)`
      : `${r.months} mois`
  const rows: [string, string][] = [
    ['Entreprise', r.companyName],
    ['Formule', r.planName],
    ['Période', period],
    ['Moyen de paiement', r.method],
    ['Date du paiement', dateFr(r.paidAt)],
  ]
  if (r.reference && !r.reference.startsWith('manual:')) rows.push(['Référence', r.reference])
  if (refunded) {
    rows.push(['Remboursé le', dateFr(r.refundedAt)])
    if (r.refundReason) rows.push(['Motif', r.refundReason])
  }
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reçu ${escapeHtml(r.receiptNumber)}</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI",Helvetica,Arial,sans-serif;color:#1E2433;background:#FAF9F7}
.sheet{position:relative;max-width:720px;margin:24px auto;background:#fff;border:1px solid #E8E5E0;border-radius:12px;padding:32px;overflow:hidden}
h1{font-size:20px;margin:0}.muted{color:#6B6660;font-size:13px}.head{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:1px solid #E8E5E0;padding-bottom:16px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:14px}td{padding:8px 0;border-bottom:1px solid #F0EEEA;vertical-align:top}td:first-child{color:#6B6660;width:42%}
.total{display:flex;justify-content:space-between;align-items:baseline;margin-top:20px;font-size:15px}.total strong{font-size:24px;font-variant-numeric:tabular-nums}
.stamp{position:absolute;top:42%;left:50%;transform:translate(-50%,-50%) rotate(-18deg);font-size:56px;font-weight:800;letter-spacing:4px;text-transform:uppercase;opacity:.12;white-space:nowrap;pointer-events:none;color:${refunded ? '#B42318' : '#067647'}}
.status{display:inline-block;margin-top:6px;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;background:${refunded ? '#FEE4E2' : '#DCFAE6'};color:${refunded ? '#B42318' : '#067647'}}
.foot{margin-top:24px;font-size:12px;color:#6B6660}.actions{max-width:720px;margin:0 auto 24px;text-align:right}
@media print{body{background:#fff}.sheet{margin:0;border:0;border-radius:0;max-width:none}.actions{display:none}}
@media print and (max-width:90mm){.sheet{padding:4mm}.stamp{font-size:32px}h1{font-size:16px}table{font-size:12px}}
@page{margin:12mm}
</style></head>
<body>
<div class="sheet">
<div class="stamp" aria-hidden="true">${refunded ? 'Remboursé' : 'Paiement reçu'}</div>
<div class="head">
<div><h1>${escapeHtml(r.platformName)}</h1><div class="muted">Reçu de paiement d’abonnement</div>${r.supportEmail ? `<div class="muted">${escapeHtml(r.supportEmail)}</div>` : ''}</div>
<div style="text-align:right"><div class="muted">Reçu n°</div><div style="font-weight:700;font-size:16px">${escapeHtml(r.receiptNumber)}</div><span class="status">${refunded ? 'Remboursé' : 'Paiement reçu'}</span></div>
</div>
<table>${rows.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('')}</table>
<div class="total"><span>Montant ${refunded ? 'remboursé' : 'reçu'}</span><strong>${escapeHtml(money(r.amount))}</strong></div>
<p class="foot">Montant exprimé en francs CFA (${escapeHtml(r.currency || 'XOF')}). Document généré par ${escapeHtml(r.platformName)} ; il fait foi du paiement de l’abonnement indiqué.</p>
</div>
<div class="actions muted">Utilisez la fonction d’impression du navigateur (Ctrl+P) pour imprimer ou enregistrer en PDF.</div>
</body></html>`
}

// ---------------------------------------------------------------------------
// Indicateurs de revenu
// ---------------------------------------------------------------------------

export type BillingMetrics = {
  mrr: number
  arr: number
  revenueThisMonth: number
  revenueLastMonth: number
  payingCompanies: number
  arpa: number
  conversion90d: { created: number; converted: number; rate: number | null }
  churn30d: { churned: number; base: number; rate: number | null }
}

/**
 * Formules (montants en FCFA, paiements `status = 'completed'` uniquement —
 * un paiement remboursé passe à 'refunded' et sort donc de tous les calculs) :
 *
 * - Entreprise payante : subscription_status = 'active', période non échue
 *   (subscription_ends_at NULL ou > maintenant), non suspendue, et au moins un
 *   paiement complété de montant > 0.
 * - MRR = Σ sur les entreprises payantes de (montant du DERNIER paiement
 *   complété > 0) / (mois couverts par ce paiement). Un annuel à 120 000 FCFA
 *   compte donc 10 000 FCFA/mois.
 * - ARR = MRR × 12.
 * - Revenu du mois / du mois précédent = Σ montants complétés encaissés sur le
 *   mois calendaire (UTC).
 * - Conversion essai → payant (90 j) = entreprises créées dans les 90 derniers
 *   jours ayant au moins un paiement complété > 0 / entreprises créées dans
 *   la fenêtre.
 * - Churn (30 j) = entreprises ayant déjà payé dont subscription_ends_at tombe
 *   dans les 30 derniers jours (donc non renouvelées : un renouvellement
 *   repousse la fin au-delà de maintenant). Taux = churnées / (payantes
 *   actuelles + churnées), approximation de la base en début de fenêtre.
 * - ARPA = MRR / nombre d'entreprises payantes.
 *
 * `scope.companyIds` restreint le calcul (tests, analyses ciblées).
 */
export async function computeBillingMetrics(scope?: { companyIds?: string[] }): Promise<BillingMetrics> {
  const ids = scope?.companyIds ?? null

  const [m] = await sql`
    WITH last_paid AS (
      SELECT DISTINCT ON (sp.company_id) sp.company_id, sp.amount, GREATEST(sp.months, 1) AS months
      FROM subscription_payments sp
      WHERE sp.status = 'completed' AND sp.amount > 0
        AND (${ids}::uuid[] IS NULL OR sp.company_id = ANY(${ids}::uuid[]))
      ORDER BY sp.company_id, sp.created_at DESC
    )
    SELECT
      COALESCE(SUM(lp.amount / lp.months), 0)::float AS mrr,
      COUNT(*)::int AS paying
    FROM companies c
    JOIN last_paid lp ON lp.company_id = c.id
    WHERE c.subscription_status = 'active'
      AND (c.subscription_ends_at IS NULL OR c.subscription_ends_at > NOW())
      AND COALESCE(c.is_suspended, false) = false
  `

  const [rev] = await sql`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('month', NOW())), 0)::float AS this_month,
      COALESCE(SUM(amount) FILTER (
        WHERE created_at >= date_trunc('month', NOW()) - INTERVAL '1 month'
          AND created_at < date_trunc('month', NOW())
      ), 0)::float AS last_month
    FROM subscription_payments
    WHERE status = 'completed'
      AND (${ids}::uuid[] IS NULL OR company_id = ANY(${ids}::uuid[]))
  `

  const [conv] = await sql`
    SELECT
      COUNT(*)::int AS created,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM subscription_payments sp
        WHERE sp.company_id = c.id AND sp.status = 'completed' AND sp.amount > 0
      ))::int AS converted
    FROM companies c
    WHERE c.created_at >= NOW() - INTERVAL '90 days'
      AND (${ids}::uuid[] IS NULL OR c.id = ANY(${ids}::uuid[]))
  `

  const [churn] = await sql`
    SELECT COUNT(*)::int AS churned
    FROM companies c
    WHERE c.subscription_ends_at >= NOW() - INTERVAL '30 days'
      AND c.subscription_ends_at <= NOW()
      AND c.subscription_status IN ('active', 'past_due', 'canceled')
      AND EXISTS (
        SELECT 1 FROM subscription_payments sp
        WHERE sp.company_id = c.id AND sp.status IN ('completed', 'refunded') AND sp.amount > 0
      )
      AND (${ids}::uuid[] IS NULL OR c.id = ANY(${ids}::uuid[]))
  `

  const mrr = Math.round(Number(m.mrr))
  const paying = Number(m.paying)
  const created = Number(conv.created)
  const converted = Number(conv.converted)
  const churned = Number(churn.churned)
  const base = paying + churned
  return {
    mrr,
    arr: mrr * 12,
    revenueThisMonth: Math.round(Number(rev.this_month)),
    revenueLastMonth: Math.round(Number(rev.last_month)),
    payingCompanies: paying,
    arpa: paying > 0 ? Math.round(mrr / paying) : 0,
    conversion90d: { created, converted, rate: created > 0 ? converted / created : null },
    churn30d: { churned, base, rate: base > 0 ? churned / base : null },
  }
}
