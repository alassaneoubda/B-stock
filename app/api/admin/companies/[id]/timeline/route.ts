import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { handleRouteError, notFound } from '@/lib/errors'
import { formatMoney } from '@/lib/format'
import type { TimelineEvent, TimelineTone } from '@/lib/admin/timeline'

/**
 * GET /api/admin/companies/:id/timeline — Historique du compte, du plus récent au plus ancien :
 * création, paiements d'abonnement, paiements initiés, actions des administrateurs
 * (sur l'entreprise, ses utilisateurs ou ses paiements) et notes internes.
 */

const LIMIT_PER_SOURCE = 100
const LIMIT_TOTAL = 200

const ACTION_LABELS: Record<string, { label: string; tone: TimelineTone }> = {
  'company.set_plan': { label: 'Abonnement modifié', tone: 'brand' },
  'company.extend_trial': { label: 'Essai prolongé', tone: 'info' },
  'company.set_status': { label: 'Statut d’abonnement modifié', tone: 'info' },
  'company.suspend': { label: 'Entreprise suspendue', tone: 'danger' },
  'company.reactivate': { label: 'Entreprise réactivée', tone: 'success' },
  'company.schedule_deletion': { label: 'Suppression programmée', tone: 'danger' },
  'company.cancel_deletion': { label: 'Suppression annulée', tone: 'success' },
  'company.export': { label: 'Données exportées', tone: 'default' },
  'company.features': { label: 'Fonctionnalités modifiées', tone: 'info' },
  'company.note_delete': { label: 'Note supprimée', tone: 'default' },
  'company.delete': { label: 'Entreprise supprimée', tone: 'danger' },
  impersonate: { label: 'Connexion en tant que client', tone: 'warning' },
  'user.reset_password_link': { label: 'Lien de réinitialisation envoyé', tone: 'info' },
  'user.set_role': { label: 'Rôle d’un utilisateur modifié', tone: 'info' },
  'user.activate': { label: 'Utilisateur réactivé', tone: 'success' },
  'user.deactivate': { label: 'Utilisateur désactivé', tone: 'warning' },
  'payment.refund': { label: 'Paiement remboursé', tone: 'warning' },
}

const HIDDEN_ACTIONS = new Set(['company.note_create', 'company.note_pin', 'company.note_unpin'])

const STATUS_LABELS: Record<string, string> = {
  trialing: 'Essai',
  active: 'Actif',
  past_due: 'Impayé',
  canceled: 'Annulé',
}

function describeAdminAction(action: string, meta: Record<string, any> | null): string | null {
  if (!meta) return null
  switch (action) {
    case 'company.set_plan':
      return [meta.planName && `Plan ${meta.planName}`, meta.status && STATUS_LABELS[meta.status]]
        .filter(Boolean)
        .join(' · ') || null
    case 'company.extend_trial':
      return meta.days ? `+${meta.days} jour(s)` : null
    case 'company.set_status':
      return meta.status ? STATUS_LABELS[meta.status] ?? meta.status : null
    case 'company.suspend':
      return meta.reason ? `Motif : ${meta.reason}` : null
    case 'company.features':
      return meta.changes
        ? Object.entries(meta.changes as Record<string, boolean>)
            .map(([k, v]) => `${k} : ${v ? 'activé' : 'désactivé'}`)
            .join(', ')
        : null
    case 'impersonate':
      return meta.email ? `Compte ${meta.email}` : null
    default:
      return null
  }
}

const PAYMENT_LABELS: Record<string, { label: string; tone: TimelineTone }> = {
  completed: { label: 'Paiement d’abonnement reçu', tone: 'success' },
  manual: { label: 'Abonnement accordé manuellement', tone: 'brand' },
  failed: { label: 'Paiement d’abonnement échoué', tone: 'danger' },
  refunded: { label: 'Paiement d’abonnement remboursé', tone: 'warning' },
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireAdmin('companies.read')
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const [company] = await sql`SELECT id, name, created_at FROM companies WHERE id = ${id}`
    if (!company) throw notFound('Entreprise')

    const [payments, checkouts, audits, notes] = await Promise.all([
      sql`
        SELECT id, plan_name, amount, months, status, provider, reference, receipt_number,
               recorded_by, refunded_at, refund_reason, metadata, created_at
        FROM subscription_payments WHERE company_id = ${id}
        ORDER BY created_at DESC LIMIT ${LIMIT_PER_SOURCE}
      `,
      sql`
        SELECT c.id, c.plan_name, c.amount, c.months, c.status, c.created_at, u.email AS user_email
        FROM subscription_checkouts c LEFT JOIN users u ON u.id = c.created_by
        WHERE c.company_id = ${id}
        ORDER BY c.created_at DESC LIMIT ${LIMIT_PER_SOURCE}
      `,
      sql`
        SELECT l.id, l.action, l.admin_email, l.metadata, l.created_at, l.target_type
        FROM platform_audit_logs l
        WHERE ((l.target_type = 'company' AND l.target_id = ${id})
           OR (l.target_type = 'user' AND l.target_id IN (SELECT u.id FROM users u WHERE u.company_id = ${id}))
           OR (l.target_type = 'payment' AND l.target_id IN (SELECT p.id FROM subscription_payments p WHERE p.company_id = ${id})))
          AND l.action <> ALL(${[...HIDDEN_ACTIONS]}::text[])
        ORDER BY l.created_at DESC LIMIT ${LIMIT_PER_SOURCE}
      `,
      sql`
        SELECT id, body, admin_email, pinned, created_at
        FROM company_notes WHERE company_id = ${id}
        ORDER BY created_at DESC LIMIT ${LIMIT_PER_SOURCE}
      `,
    ])

    const iso = (v: unknown) => new Date(v as string).toISOString()
    const events: TimelineEvent[] = []

    if (company.created_at) {
      events.push({
        id: `created-${company.id}`,
        kind: 'created',
        label: 'Entreprise créée',
        detail: company.name,
        date: iso(company.created_at),
        actor: null,
        tone: 'default',
      })
    }

    for (const p of payments) {
      const meta = PAYMENT_LABELS[p.status] ?? { label: `Paiement (${p.status})`, tone: 'default' as const }
      const parts = [
        p.plan_name && `Plan ${p.plan_name}`,
        Number(p.amount) > 0 && formatMoney(p.amount),
        p.months ? `${p.months} mois` : null,
        p.receipt_number || p.reference,
      ].filter(Boolean)
      events.push({
        id: `payment-${p.id}`,
        kind: 'payment',
        label: meta.label,
        detail: parts.join(' · ') || null,
        date: iso(p.created_at),
        actor: p.recorded_by || p.metadata?.grantedBy || (p.provider === 'geniuspay' ? 'GeniusPay' : null),
        tone: meta.tone,
      })
      if (p.refunded_at && p.status === 'refunded') {
        events.push({
          id: `refund-${p.id}`,
          kind: 'payment',
          label: 'Remboursement effectué',
          detail: [formatMoney(p.amount), p.refund_reason].filter(Boolean).join(' · '),
          date: iso(p.refunded_at),
          actor: p.recorded_by ?? null,
          tone: 'warning',
        })
      }
    }

    for (const c of checkouts) {
      events.push({
        id: `checkout-${c.id}`,
        kind: 'checkout',
        label: 'Paiement initié en ligne',
        detail: [c.plan_name, formatMoney(c.amount), `${c.months} mois`, c.status === 'pending' ? 'en attente' : c.status]
          .filter(Boolean)
          .join(' · '),
        date: iso(c.created_at),
        actor: c.user_email ?? null,
        tone: c.status === 'completed' ? 'success' : c.status === 'failed' ? 'danger' : 'default',
      })
    }

    for (const a of audits) {
      // Les notes apparaissent déjà en tant que telles
      if (HIDDEN_ACTIONS.has(a.action)) continue
      const meta = ACTION_LABELS[a.action] ?? { label: a.action, tone: 'default' as const }
      events.push({
        id: `audit-${a.id}`,
        kind: 'admin',
        action: a.action,
        label: meta.label,
        detail: describeAdminAction(a.action, a.metadata),
        date: iso(a.created_at),
        actor: a.admin_email ?? null,
        tone: meta.tone,
      })
    }

    for (const n of notes) {
      events.push({
        id: `note-${n.id}`,
        kind: 'note',
        label: n.pinned ? 'Note interne (épinglée)' : 'Note interne',
        detail: String(n.body).length > 160 ? `${String(n.body).slice(0, 157)}…` : n.body,
        date: iso(n.created_at),
        actor: n.admin_email ?? null,
        tone: 'default',
      })
    }

    events.sort((a, b) => b.date.localeCompare(a.date))
    return NextResponse.json({ success: true, data: events.slice(0, LIMIT_TOTAL) })
  } catch (error) {
    return handleRouteError(error, 'admin.companies.timeline')
  }
}
