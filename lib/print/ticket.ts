/**
 * Ticket de caisse thermique (58 / 80 mm) — modèle et mise en page PURES.
 *
 * Une seule description du contenu (`layoutTicket` → lignes sémantiques) sert
 * à la fois au rendu HTML imprimé par le navigateur et à l'encodage ESC/POS
 * des imprimantes Bluetooth : les deux sorties affichent exactement la même
 * chose.
 */

import { formatDateTime, formatNumber } from '@/lib/format'

export type PaperWidth = 58 | 80

export const PAPER_WIDTHS: readonly PaperWidth[] = [58, 80]

/** Caractères par ligne en police A (12 × 24) des imprimantes ESC/POS courantes. */
export function paperColumns(width: PaperWidth): number {
  return width === 58 ? 32 : 48
}

export type TicketLine = { name: string; quantity: number; unitPrice: number; total?: number }

/** Consignes (emballages sortis / rendus). */
export type TicketDeposit = { name: string; quantityOut: number; quantityIn: number; unitPrice: number }

export type TicketData = {
  company: { name: string; address?: string | null; phone?: string | null; logoUrl?: string | null }
  /** Ex. « Ticket de caisse », « Vente ». */
  title?: string
  number: string
  date: string | Date
  /** Lignes d'information sous l'en-tête (client, table, caissier…). */
  meta?: { label: string; value: string }[]
  lines: TicketLine[]
  deposits?: TicketDeposit[]
  total: number
  paid?: number | null
  paymentLabel?: string | null
  change?: number | null
  /** Reste à payer (vente à crédit). */
  due?: number | null
  /** Mention de bas de ticket. */
  footer?: string | null
}

export type TicketRow =
  | { kind: 'logo'; src: string }
  | { kind: 'center'; text: string; bold?: boolean; big?: boolean }
  | { kind: 'text'; text: string; indent?: boolean }
  | { kind: 'pair'; left: string; right: string; bold?: boolean; big?: boolean }
  | { kind: 'rule' }
  | { kind: 'feed' }

/** Espaces insécables produites par Intl (fr-FR). */
const NBSP = /[\u00a0\u202f]/g

/** « 12 500 FCFA » avec des espaces ordinaires (imprimables partout). */
export function ticketMoney(value: number): string {
  return `${formatNumber(Math.round(Number(value) || 0))} FCFA`.replace(NBSP, ' ')
}

function plain(text: string): string {
  return String(text ?? '').replace(NBSP, ' ').replace(/\s+/g, ' ').trim()
}

export function lineTotal(line: TicketLine): number {
  return line.total ?? line.quantity * line.unitPrice
}

export function depositNet(d: TicketDeposit): number {
  return (d.quantityOut - d.quantityIn) * d.unitPrice
}

export function layoutTicket(data: TicketData, opts: { withLogo?: boolean } = {}): TicketRow[] {
  const rows: TicketRow[] = []
  const { company } = data
  if (opts.withLogo && company.logoUrl) rows.push({ kind: 'logo', src: company.logoUrl })
  rows.push({ kind: 'center', text: plain(company.name), bold: true, big: true })
  if (company.address) rows.push({ kind: 'center', text: plain(company.address) })
  if (company.phone) rows.push({ kind: 'center', text: `Tél. ${plain(company.phone)}` })
  rows.push({ kind: 'rule' })
  rows.push({ kind: 'center', text: `${plain(data.title ?? 'Ticket')} ${plain(data.number)}`, bold: true })
  rows.push({ kind: 'center', text: plain(formatDateTime(data.date)) })
  for (const m of data.meta ?? []) {
    if (m.value) rows.push({ kind: 'pair', left: plain(m.label), right: plain(m.value) })
  }
  rows.push({ kind: 'rule' })

  for (const line of data.lines) {
    rows.push({ kind: 'text', text: plain(line.name) })
    rows.push({
      kind: 'pair',
      left: `  ${formatNumber(line.quantity).replace(NBSP, ' ')} x ${ticketMoney(line.unitPrice)}`,
      right: ticketMoney(lineTotal(line)),
    })
  }

  const deposits = (data.deposits ?? []).filter((d) => d.quantityOut > 0 || d.quantityIn > 0)
  if (deposits.length > 0) {
    const productsTotal = data.lines.reduce((s, l) => s + lineTotal(l), 0)
    rows.push({ kind: 'rule' })
    rows.push({ kind: 'pair', left: 'Sous-total produits', right: ticketMoney(productsTotal) })
    rows.push({ kind: 'text', text: 'Consignes' })
    for (const d of deposits) {
      const moves = [d.quantityOut > 0 ? `+${d.quantityOut}` : '', d.quantityIn > 0 ? `-${d.quantityIn} rendu(s)` : '']
        .filter(Boolean)
        .join(' ')
      rows.push({ kind: 'pair', left: `  ${plain(d.name)} ${moves}`, right: ticketMoney(depositNet(d)) })
    }
  }

  rows.push({ kind: 'rule' })
  rows.push({ kind: 'pair', left: 'TOTAL', right: ticketMoney(data.total), bold: true, big: true })
  if (data.paid != null) {
    rows.push({ kind: 'pair', left: data.paymentLabel ? `Payé (${plain(data.paymentLabel)})` : 'Payé', right: ticketMoney(data.paid) })
  }
  if (data.change != null && data.change > 0) rows.push({ kind: 'pair', left: 'Rendu', right: ticketMoney(data.change) })
  if (data.due != null && data.due > 0) rows.push({ kind: 'pair', left: 'Reste à payer', right: ticketMoney(data.due), bold: true })

  const footer = plain(data.footer ?? '')
  if (footer) {
    rows.push({ kind: 'rule' })
    rows.push({ kind: 'center', text: footer })
  }
  rows.push({ kind: 'feed' })
  return rows
}

/** Découpe un texte en lignes de `cols` caractères au plus (coupure aux espaces). */
export function wrapText(text: string, cols: number): string[] {
  const words = text.split(' ').filter(Boolean)
  const out: string[] = []
  let current = ''
  for (let word of words) {
    while (word.length > cols) {
      if (current) {
        out.push(current)
        current = ''
      }
      out.push(word.slice(0, cols))
      word = word.slice(cols)
    }
    if (!word) continue
    if (!current) current = word
    else if (current.length + 1 + word.length <= cols) current += ` ${word}`
    else {
      out.push(current)
      current = word
    }
  }
  if (current) out.push(current)
  return out.length ? out : ['']
}

/** Libellé à gauche, montant aligné à droite ; le libellé est tronqué si besoin. */
export function pairLine(left: string, right: string, cols: number): string {
  const r = right.slice(0, cols)
  const room = cols - r.length - 1
  if (room <= 0) return r.padStart(cols)
  const l = left.length > room ? `${left.slice(0, Math.max(0, room - 1))}.` : left
  return `${l}${' '.repeat(cols - l.length - r.length)}${r}`
}

export function centerLine(text: string, cols: number): string {
  const t = text.slice(0, cols)
  const pad = Math.floor((cols - t.length) / 2)
  return `${' '.repeat(pad)}${t}`
}

/**
 * Rendu texte à largeur fixe (une chaîne par ligne imprimée). `big` = double
 * hauteur à l'impression ESC/POS (la largeur, donc le nombre de colonnes, ne
 * change pas).
 */
export function ticketTextLines(rows: TicketRow[], width: PaperWidth): { text: string; bold?: boolean; big?: boolean }[] {
  const cols = paperColumns(width)
  const out: { text: string; bold?: boolean; big?: boolean }[] = []
  for (const row of rows) {
    switch (row.kind) {
      case 'logo':
        break
      case 'center': {
        for (const l of wrapText(row.text, cols)) out.push({ text: centerLine(l, cols), bold: row.bold, big: row.big })
        break
      }
      case 'text': {
        for (const l of wrapText(row.text, cols)) out.push({ text: l })
        break
      }
      case 'pair': {
        out.push({ text: pairLine(row.left, row.right, cols), bold: row.bold, big: row.big })
        break
      }
      case 'rule':
        out.push({ text: '-'.repeat(cols) })
        break
      case 'feed':
        out.push({ text: '' })
        break
    }
  }
  return out
}
