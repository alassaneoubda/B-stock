import { AppError } from '../errors'

/**
 * Clôture (verrouillage) des périodes comptables.
 *
 * Quand le propriétaire verrouille un mois (en général après l'avoir exporté
 * vers son expert-comptable), plus aucun document daté dans ce mois ne peut
 * être créé, modifié ou annulé : l'export déjà transmis reste juste.
 *
 * Usage, DANS la transaction de l'opération (avant toute écriture) :
 *
 *   await assertPeriodOpen(tx.sql, companyId)                 // document daté d'aujourd'hui
 *   await assertPeriodOpen(tx.sql, companyId, invoice.created_at) // document existant
 *
 * Erreur levée : AppError 409 « PERIOD_LOCKED » (message affichable).
 */

export type QueryFn = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<any[]>

const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

/** « 2026-09-01 » → « septembre 2026 » */
export function periodLabel(periodStart: string): string {
  const [y, m] = periodStart.slice(0, 7).split('-')
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`
}

/** Normalise une date (Date, ISO, timestamp SQL) en « AAAA-MM-JJ », ou null. */
export function toIsoDate(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    // Les TIMESTAMP sans fuseau sont relus par `pg` en heure locale du serveur
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

/** « AAAA-MM » → « AAAA-MM-01 » (premier jour du mois), sinon null. */
export function periodStartOf(period: string): string | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period)
  return m ? `${m[1]}-${m[2]}-01` : null
}

let tableChecked = false

/** La table existe-t-elle ? (migration 032 pas encore appliquée → aucune période verrouillée) */
async function lockTableExists(q: QueryFn): Promise<boolean> {
  if (tableChecked) return true
  const [row] = await q`SELECT to_regclass('public.accounting_period_locks') IS NOT NULL AS ok`
  if (row?.ok) tableChecked = true
  return Boolean(row?.ok)
}

/** Mois verrouillé contenant cette date (null = aujourd'hui), ou null si la période est ouverte. */
export async function findLockedPeriod(
  q: QueryFn,
  companyId: string,
  date?: Date | string | null
): Promise<string | null> {
  if (!(await lockTableExists(q))) return null
  const iso = toIsoDate(date ?? null)
  const rows = await q`
    SELECT to_char(period_start, 'YYYY-MM-DD') AS period_start
    FROM accounting_period_locks
    WHERE company_id = ${companyId}
      AND period_start = date_trunc('month', COALESCE(${iso}::date, CURRENT_DATE))::date
  `
  return rows[0]?.period_start ?? null
}

/**
 * Refuse l'opération si la date du document (aujourd'hui par défaut) tombe
 * dans un mois clôturé.
 */
export async function assertPeriodOpen(
  q: QueryFn,
  companyId: string,
  date?: Date | string | null
): Promise<void> {
  const locked = await findLockedPeriod(q, companyId, date)
  if (locked) {
    throw new AppError(
      409,
      `La période de ${periodLabel(locked)} est clôturée (export comptable transmis) : ` +
        'aucun document daté de ce mois ne peut être créé, modifié ou annulé. ' +
        'Le propriétaire peut rouvrir la période dans Comptabilité > Export comptable.',
      'PERIOD_LOCKED'
    )
  }
}
