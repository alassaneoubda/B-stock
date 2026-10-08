import { escapeCell } from '../csv'
import { stripAccents, type ExportFormat } from './chart'
import type { EntryLine } from './entries'

/**
 * Formats de fichier de l'export comptable.
 *
 * 1. CSV générique (« csv ») — pour Excel et la plupart des logiciels
 *    (import paramétrable) :
 *      - encodage UTF-8 avec BOM (Excel reconnaît l'UTF-8 et les accents) ;
 *      - séparateur « ; », décimales à virgule, sans séparateur de milliers ;
 *      - fins de ligne CRLF ; date JJ/MM/AAAA ;
 *      - colonnes : Date ; Journal ; N° pièce ; Compte ; Compte auxiliaire ;
 *        Libellé ; Débit ; Crédit.
 *
 * 2. Sage 100 Comptabilité (« sage ») — fichier pour le « Format
 *    import/export paramétrable » de Sage 100 (menu Fichier > Format
 *    import/export paramétrable, modèle à créer une fois chez le cabinet
 *    avec ces colonnes dans cet ordre, séparateur « ; », sans ligne d'en-tête
 *    à ignorer : la première ligne est l'en-tête) :
 *        Code journal          (6 car. max)
 *        Date                  JJMMAA
 *        N° pièce              (13 car. max)
 *        N° facture            (17 car. max — ici identique au n° de pièce)
 *        N° compte général     (13 car. max)
 *        N° compte tiers       (17 car. max, vide si aucun)
 *        Libellé écriture      (35 car. max)
 *        Montant débit         décimales à virgule
 *        Montant crédit        décimales à virgule
 *    Encodage : ASCII pur (accents retirés, sans BOM) — Sage 100 lit les
 *    fichiers en ANSI/Windows-1252 et afficherait mal l'UTF-8.
 */

export { EXPORT_FORMATS, type ExportFormat } from './chart'

/** Marque d'ordre des octets UTF-8 (U+FEFF) : Excel reconnaît alors l'UTF-8. */
export const BOM = String.fromCharCode(0xfeff)

/** 1500 → « 1500,00 » ; -12.5 → « -12,50 » (sans séparateur de milliers). */
export function formatAmountFr(value: number): string {
  const cents = Math.round((Number(value) || 0) * 100)
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

/** « 2026-10-07 » → « 07/10/2026 » */
export function formatDateFr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** « 2026-10-07 » → « 071026 » */
export function formatDateSage(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}${m}${y.slice(2)}`
}

/** Montant au format français (« -12,50 ») : jamais interprété comme une formule. */
const FR_AMOUNT = /^-?\d+,\d{2}$/

/**
 * Cellule CSV avec séparateur « ; » : guillemets uniquement si la valeur
 * contient « ; », un guillemet ou un saut de ligne (les virgules décimales
 * restent nues), et neutralisation de l'injection de formules (lib/csv).
 */
function cell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (FR_AMOUNT.test(s)) return s
  // escapeCell préfixe les formules d'une apostrophe et met entre guillemets si besoin
  const escaped = escapeCell(s)
  if (escaped.startsWith('"') && !/[";\n\r]/.test(s)) {
    // Guillemets ajoutés pour une simple virgule ou tabulation : inutiles avec « ; »
    return escaped.slice(1, -1).replace(/""/g, '"')
  }
  return escaped
}

function row(values: unknown[]): string {
  return values.map(cell).join(';')
}

export function toGenericCsv(lines: EntryLine[]): string {
  const header = row(['Date', 'Journal', 'N° pièce', 'Compte', 'Compte auxiliaire', 'Libellé', 'Débit', 'Crédit'])
  const body = lines.map((l) =>
    row([
      formatDateFr(l.date),
      l.journal,
      l.piece,
      l.account,
      l.auxiliary ?? '',
      l.label,
      formatAmountFr(l.debit),
      formatAmountFr(l.credit),
    ])
  )
  return BOM + [header, ...body].join('\r\n') + '\r\n'
}

/** Texte ASCII pour Sage : sans accents ni caractères spéciaux, tronqué. */
export function sageText(value: string, max: number): string {
  return stripAccents(value)
    .replace(/[’‘]/g, "'")
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/;/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

export function toSageCsv(lines: EntryLine[]): string {
  const header = [
    'Code journal',
    'Date',
    'N piece',
    'N facture',
    'N compte general',
    'N compte tiers',
    'Libelle ecriture',
    'Montant debit',
    'Montant credit',
  ].join(';')
  const body = lines.map((l) =>
    row([
      sageText(l.journal, 6),
      formatDateSage(l.date),
      sageText(l.piece, 13),
      sageText(l.piece, 17),
      sageText(l.account, 13),
      sageText(l.auxiliary ?? '', 17),
      sageText(l.label, 35),
      formatAmountFr(l.debit),
      formatAmountFr(l.credit),
    ])
  )
  return [header, ...body].join('\r\n') + '\r\n'
}

export function renderExport(lines: EntryLine[], format: ExportFormat): { content: string; contentType: string; extension: string } {
  if (format === 'sage') {
    return { content: toSageCsv(lines), contentType: 'text/csv; charset=us-ascii', extension: 'txt' }
  }
  return { content: toGenericCsv(lines), contentType: 'text/csv; charset=utf-8', extension: 'csv' }
}
