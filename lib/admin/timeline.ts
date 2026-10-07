/** Types de l'historique d'une entreprise (API /api/admin/companies/:id/timeline). */

export type TimelineKind = 'created' | 'payment' | 'checkout' | 'admin' | 'note'
export type TimelineTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand'

export type TimelineEvent = {
  id: string
  kind: TimelineKind
  /** Action d'audit brute (pour l'icône) — uniquement pour kind = admin. */
  action?: string
  label: string
  detail?: string | null
  date: string
  actor: string | null
  tone: TimelineTone
}
