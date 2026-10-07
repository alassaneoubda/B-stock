import { timingSafeEqual } from 'node:crypto'

/**
 * Authentifie un appel de tâche planifiée (Vercel Cron, GitHub Actions, cron externe).
 * Attendu : en-tête `Authorization: Bearer <CRON_SECRET>`.
 * Sans CRON_SECRET configuré, les tâches sont désactivées (refus).
 */
export function isAuthorizedCron(headers: Headers): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16) return false
  const header = headers.get('authorization') || ''
  const expected = `Bearer ${secret}`
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
