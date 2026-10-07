import { sql } from './db'
import { appUrl, isEmailConfigured, renderEmail, sendEmail } from './email'

/**
 * Relances d'échéance d'abonnement (tâche planifiée quotidienne).
 *
 * Paliers, calculés sur la date (UTC) de fin de la période en cours —
 * trial_ends_at pour un essai, subscription_ends_at pour un abonnement actif :
 *   d7 = fin dans 7 jours, d3 = dans 3 jours, d0 = aujourd'hui, expired = hier.
 *
 * Idempotence : la ligne subscription_reminders (unique company_id, kind,
 * period_end) est réservée AVANT l'envoi ; un second passage (ou deux crons
 * concurrents) ne renvoie rien. Une prolongation change period_end et ouvre
 * donc un nouveau cycle de relances.
 *
 * Sans email configuré (ou sans adresse propriétaire), la relance est notée
 * « skipped » / canal « in_app » et une annonce ciblée sur l'entreprise est
 * créée pour que le propriétaire la voie dans l'application.
 */

export type ReminderKind = 'd7' | 'd3' | 'd0' | 'expired'

export type ReminderSummary = {
  candidates: number
  sent: number
  skipped: number
  failed: number
  alreadySent: number
}

type Candidate = {
  company_id: string
  company_name: string
  kind: ReminderKind
  period_end: string
  period_end_ts: string | Date
  is_trial: boolean
}

function dateFr(v: string | Date): string {
  const d = v instanceof Date ? v : new Date(v)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function content(c: Candidate): { subject: string; title: string; paragraphs: string[]; short: string } {
  const what = c.is_trial ? 'Votre période d’essai' : 'Votre abonnement'
  const when = dateFr(c.period_end_ts)
  switch (c.kind) {
    case 'd7':
      return {
        subject: `${what} B-Stock se termine dans 7 jours`,
        title: `${what} se termine dans 7 jours`,
        paragraphs: [
          `${what} pour « ${c.company_name} » se termine le ${when}.`,
          'Renouvelez dès maintenant pour continuer à utiliser B-Stock sans interruption : les jours restants ne sont pas perdus.',
        ],
        short: `${what} se termine le ${when}. Renouvelez pour éviter toute interruption.`,
      }
    case 'd3':
      return {
        subject: `${what} B-Stock se termine dans 3 jours`,
        title: `Plus que 3 jours`,
        paragraphs: [
          `${what} pour « ${c.company_name} » se termine le ${when}.`,
          'Pensez à renouveler par Mobile Money depuis la page Abonnement : l’activation est immédiate.',
        ],
        short: `${what} se termine dans 3 jours (le ${when}).`,
      }
    case 'd0':
      return {
        subject: `${what} B-Stock se termine aujourd’hui`,
        title: `${what} se termine aujourd’hui`,
        paragraphs: [
          `${what} pour « ${c.company_name} » se termine aujourd’hui.`,
          'Renouvelez maintenant pour garder l’accès à vos ventes, votre stock et votre caisse.',
        ],
        short: `${what} se termine aujourd’hui. Renouvelez pour garder l’accès.`,
      }
    case 'expired':
      return {
        subject: `${what} B-Stock a expiré`,
        title: `${what} a expiré`,
        paragraphs: [
          `${what} pour « ${c.company_name} » a pris fin le ${when}.`,
          'Vos données sont conservées. Renouvelez pour retrouver l’accès complet à B-Stock.',
        ],
        short: `${what} a expiré le ${when}. Vos données sont conservées : renouvelez pour retrouver l’accès.`,
      }
  }
}

async function findCandidates(): Promise<Candidate[]> {
  return (await sql`
    WITH periods AS (
      SELECT c.id AS company_id, c.name AS company_name,
             CASE WHEN c.subscription_status = 'trialing' THEN c.trial_ends_at ELSE c.subscription_ends_at END AS ends_at,
             c.subscription_status = 'trialing' AS is_trial
      FROM companies c
      WHERE c.subscription_status IN ('trialing', 'active')
        AND COALESCE(c.is_suspended, false) = false
    )
    SELECT company_id, company_name, is_trial, ends_at AS period_end_ts,
           to_char(ends_at::date, 'YYYY-MM-DD') AS period_end,
           CASE (ends_at::date - CURRENT_DATE)
             WHEN 7 THEN 'd7' WHEN 3 THEN 'd3' WHEN 0 THEN 'd0' WHEN -1 THEN 'expired'
           END AS kind
    FROM periods
    WHERE ends_at IS NOT NULL AND (ends_at::date - CURRENT_DATE) IN (7, 3, 0, -1)
  `) as Candidate[]
}

async function ownerEmails(companyId: string): Promise<string[]> {
  const rows = await sql`
    SELECT DISTINCT email FROM users
    WHERE company_id = ${companyId} AND role = 'owner' AND COALESCE(is_active, true) = true
      AND email IS NOT NULL AND email <> ''
  `
  return rows.map((r) => String(r.email))
}

export async function sendSubscriptionReminders(): Promise<ReminderSummary> {
  const candidates = await findCandidates()
  const summary: ReminderSummary = { candidates: candidates.length, sent: 0, skipped: 0, failed: 0, alreadySent: 0 }
  const emailReady = isEmailConfigured()

  for (const c of candidates) {
    // Réservation (idempotence) : statut provisoire, mis à jour après l'envoi.
    const claimed = await sql`
      INSERT INTO subscription_reminders (company_id, kind, period_end, channel, status, error)
      VALUES (${c.company_id}, ${c.kind}, ${c.period_end}::date, ${emailReady ? 'email' : 'in_app'}, 'failed', 'en cours')
      ON CONFLICT (company_id, kind, period_end) DO NOTHING
      RETURNING id
    `
    if (claimed.length === 0) {
      summary.alreadySent++
      continue
    }
    const reminderId = claimed[0].id as string
    const text = content(c)

    try {
      const recipients = emailReady ? await ownerEmails(c.company_id) : []
      if (emailReady && recipients.length > 0) {
        const mail = renderEmail({
          title: text.title,
          paragraphs: text.paragraphs,
          cta: { label: 'Renouveler mon abonnement', url: appUrl('/dashboard/plans') },
        })
        const results = await Promise.all(
          recipients.map((to) => sendEmail({ to, subject: text.subject, html: mail.html, text: mail.text }))
        )
        const ok = results.some((r) => r.sent)
        const reason = results.find((r) => !r.sent) as { reason?: string } | undefined
        await sql`
          UPDATE subscription_reminders
          SET channel = 'email', status = ${ok ? 'sent' : 'failed'}, error = ${ok ? null : reason?.reason ?? 'envoi impossible'}
          WHERE id = ${reminderId}
        `
        if (ok) summary.sent++
        else summary.failed++
        continue
      }

      // Repli in-app : annonce ciblée, visible jusqu'à 3 jours après l'échéance.
      await sql`
        INSERT INTO announcements
          (title, body, level, audience, target_company_id, dismissible, is_active, starts_at, ends_at, created_by_email)
        VALUES (
          ${text.title}, ${text.short}, 'warning', 'company', ${c.company_id}, true, true, NOW(),
          ${c.period_end}::date + INTERVAL '3 days', 'relances-automatiques'
        )
      `
      await sql`
        UPDATE subscription_reminders
        SET channel = 'in_app', status = 'skipped',
            error = ${emailReady ? 'aucune adresse propriétaire' : 'email non configuré'}
        WHERE id = ${reminderId}
      `
      summary.skipped++
    } catch (e) {
      summary.failed++
      await sql`
        UPDATE subscription_reminders SET status = 'failed', error = ${e instanceof Error ? e.message.slice(0, 500) : 'erreur'}
        WHERE id = ${reminderId}
      `.catch(() => {})
      console.error('[reminders] relance échouée', c.company_id, c.kind, e)
    }
  }
  return summary
}
