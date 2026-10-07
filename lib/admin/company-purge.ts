import { sql, withTransaction } from '@/lib/db'
import { AppError, notFound } from '@/lib/errors'

/**
 * Suppression différée des entreprises.
 *
 * Le back-office ne supprime plus une entreprise immédiatement : il programme la
 * suppression à J+30 et suspend le compte (motif « Suppression programmée »).
 * Pendant ce délai la suppression peut être annulée et les données exportées.
 * La tâche planifiée `purge-companies` supprime ensuite les comptes échus
 * (ON DELETE CASCADE supprime les données liées).
 */

export const DELETION_DELAY_DAYS = 30
export const DELETION_SUSPENSION_REASON = 'Suppression programmée'

export async function scheduleCompanyDeletion(companyId: string, requestedBy: string) {
  return withTransaction(async (tx) => {
    const [company] = await tx.sql`
      SELECT id, name, deletion_scheduled_at, is_suspended, suspension_reason
      FROM companies WHERE id = ${companyId} FOR UPDATE
    `
    if (!company) throw notFound('Entreprise')
    if (company.deletion_scheduled_at) {
      throw new AppError(409, 'La suppression de cette entreprise est déjà programmée', 'ALREADY_SCHEDULED')
    }
    const [updated] = await tx.sql`
      UPDATE companies SET
        deletion_scheduled_at = NOW() + (${DELETION_DELAY_DAYS} * INTERVAL '1 day'),
        deletion_requested_by = ${requestedBy},
        is_suspended = true,
        suspended_at = COALESCE(suspended_at, NOW()),
        suspension_reason = ${DELETION_SUSPENSION_REASON},
        updated_at = NOW()
      WHERE id = ${companyId}
      RETURNING id, name, deletion_scheduled_at
    `
    return {
      id: updated.id as string,
      name: updated.name as string,
      deletion_scheduled_at: updated.deletion_scheduled_at as Date,
      previous: { isSuspended: !!company.is_suspended, suspensionReason: (company.suspension_reason as string | null) ?? null },
    }
  })
}

/**
 * Annule une suppression programmée. La suspension n'est levée que si elle avait été
 * posée par la programmation (motif « Suppression programmée »).
 */
export async function cancelCompanyDeletion(companyId: string) {
  return withTransaction(async (tx) => {
    const [company] = await tx.sql`
      SELECT id, name, deletion_scheduled_at FROM companies WHERE id = ${companyId} FOR UPDATE
    `
    if (!company) throw notFound('Entreprise')
    if (!company.deletion_scheduled_at) {
      throw new AppError(409, "Aucune suppression n'est programmée pour cette entreprise", 'NOT_SCHEDULED')
    }
    const [updated] = await tx.sql`
      UPDATE companies SET
        deletion_scheduled_at = NULL,
        deletion_requested_by = NULL,
        is_suspended = CASE WHEN suspension_reason = ${DELETION_SUSPENSION_REASON} THEN false ELSE is_suspended END,
        suspended_at = CASE WHEN suspension_reason = ${DELETION_SUSPENSION_REASON} THEN NULL ELSE suspended_at END,
        suspension_reason = CASE WHEN suspension_reason = ${DELETION_SUSPENSION_REASON} THEN NULL ELSE suspension_reason END,
        updated_at = NOW()
      WHERE id = ${companyId}
      RETURNING id, name, is_suspended
    `
    return {
      id: updated.id as string,
      name: updated.name as string,
      is_suspended: !!updated.is_suspended,
      scheduledAt: company.deletion_scheduled_at as Date,
    }
  })
}

/** Supprime définitivement les entreprises dont la date de suppression est passée. */
export async function purgeScheduledDeletions(): Promise<{
  purged: number
  failed: number
  companies: { id: string; name: string }[]
}> {
  const due = await sql`
    SELECT id FROM companies
    WHERE deletion_scheduled_at IS NOT NULL AND deletion_scheduled_at < NOW()
    ORDER BY deletion_scheduled_at
  `
  // Une entreprise à la fois : un échec n'empêche pas la purge des autres
  const companies: { id: string; name: string }[] = []
  let failed = 0
  for (const { id } of due) {
    try {
      // Condition rejouée : une annulation entre-temps est respectée
      const [row] = await sql`
        DELETE FROM companies
        WHERE id = ${id} AND deletion_scheduled_at IS NOT NULL AND deletion_scheduled_at < NOW()
        RETURNING id, name
      `
      if (row) companies.push({ id: row.id as string, name: row.name as string })
    } catch (e) {
      failed++
      console.error(`[company-purge] échec suppression ${id}:`, e)
    }
  }
  if (companies.length > 0) {
    try {
      await sql`
        INSERT INTO platform_audit_logs (admin_id, admin_email, action, target_type, target_id, metadata)
        SELECT NULL, 'cron', 'company.purge', 'company', (c->>'id')::uuid, c
        FROM jsonb_array_elements(${JSON.stringify(companies)}::jsonb) AS c
      `
    } catch (e) {
      console.error('[company-purge] échec écriture audit:', e)
    }
  }
  return { purged: companies.length, failed, companies }
}
