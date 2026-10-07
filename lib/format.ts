/**
 * Formatage unique de l'application (montants, nombres, dates).
 * Remplace les ~20 fonctions formatCurrency locales qui affichaient tour à tour
 * « F CFA », « FCFA » ou « XOF ». Convention : « 12 500 FCFA ».
 */

const numberFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const decimalFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** 12500 → « 12 500 FCFA » (espaces insécables, pas de centimes). */
export function formatMoney(value: unknown): string {
  return `${numberFmt.format(Math.round(toNumber(value)))} FCFA`
}

/** Montant signé pour les soldes : « +2 000 FCFA » / « −2 000 FCFA ». */
export function formatSignedMoney(value: unknown): string {
  const n = toNumber(value)
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${formatMoney(Math.abs(n))}`
}

/** 1234 → « 1 234 » ; 2.5 → « 2,5 ». */
export function formatNumber(value: unknown): string {
  const n = toNumber(value)
  return Number.isInteger(n) ? numberFmt.format(n) : decimalFmt.format(n)
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d
}

/** « 06/10/2026 » */
export function formatDate(value: unknown): string {
  const d = toDate(value)
  return d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

/** « 6 oct. 2026 » */
export function formatDateShort(value: unknown): string {
  const d = toDate(value)
  return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

/** « 06/10/2026 14:05 » */
export function formatDateTime(value: unknown): string {
  const d = toDate(value)
  return d
    ? `${formatDate(d)} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
    : '—'
}

/** « il y a 5 min », « hier », sinon la date. */
export function formatRelative(value: unknown): string {
  const d = toDate(value)
  if (!d) return '—'
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000)
  if (diffSec < 60) return "à l'instant"
  if (diffSec < 3600) return `il y a ${Math.floor(diffSec / 60)} min`
  if (diffSec < 86_400) return `il y a ${Math.floor(diffSec / 3600)} h`
  if (diffSec < 172_800) return 'hier'
  return formatDateShort(d)
}
