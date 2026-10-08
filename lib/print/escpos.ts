/**
 * Encodage ESC/POS d'un ticket (imprimantes thermiques Bluetooth / USB
 * courantes : Xprinter, GOOJPRT, MUNBYN, Netum, imprimantes « PT-210 »…).
 * Module pur : renvoie les octets à envoyer, sans dépendance au navigateur.
 *
 * Accents : page de code PC850 (ESC t 2), gérée par la quasi-totalité de ces
 * imprimantes ; les caractères absents de PC850 sont translittérés.
 */

import { layoutTicket, ticketTextLines, type PaperWidth, type TicketData } from './ticket'

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

/** Caractères non ASCII de PC850 utiles en français (et quelques symboles). */
const CP850: Record<string, number> = {
  Ç: 0x80, ü: 0x81, é: 0x82, â: 0x83, ä: 0x84, à: 0x85, å: 0x86, ç: 0x87, ê: 0x88, ë: 0x89,
  è: 0x8a, ï: 0x8b, î: 0x8c, ì: 0x8d, Ä: 0x8e, Å: 0x8f, É: 0x90, æ: 0x91, Æ: 0x92, ô: 0x93,
  ö: 0x94, ò: 0x95, û: 0x96, ù: 0x97, ÿ: 0x98, Ö: 0x99, Ü: 0x9a, '£': 0x9c, '×': 0x9e,
  á: 0xa0, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, '«': 0xae, '»': 0xaf,
  Á: 0xb5, Â: 0xb6, À: 0xb7, Ê: 0xd2, Ë: 0xd3, È: 0xd4, Í: 0xd6, Î: 0xd7, Ï: 0xd8,
  Ó: 0xe0, Ô: 0xe2, Ò: 0xe3, Ú: 0xe9, Û: 0xea, Ù: 0xeb, '°': 0xf8,
}

const TRANSLIT: Record<string, string> = {
  œ: 'oe', Œ: 'OE', '€': 'EUR', '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-',
  '…': '...', '•': '-', '\u00a0': ' ', '\u202f': ' ', 'Ÿ': 'Y',
}

/** Texte → octets PC850 (ASCII imprimable conservé, le reste translittéré ou « ? »). */
export function encodeCp850(text: string): number[] {
  const out: number[] = []
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (code >= 0x20 && code < 0x7f) {
      out.push(code)
      continue
    }
    if (ch === '\n') {
      out.push(LF)
      continue
    }
    const mapped = CP850[ch]
    if (mapped !== undefined) {
      out.push(mapped)
      continue
    }
    const translit = TRANSLIT[ch] ?? ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    for (const c of translit) {
      const cc = c.codePointAt(0)!
      out.push(cc >= 0x20 && cc < 0x7f ? cc : 0x3f)
    }
  }
  return out
}

export type EscPosOptions = {
  /** Coupe le papier à la fin (ignoré par les imprimantes sans massicot). */
  cut?: boolean
  /** Lignes blanches avant la coupe / l'arrachage. */
  feedLines?: number
}

export function encodeTicketEscPos(data: TicketData, width: PaperWidth, options: EscPosOptions = {}): Uint8Array {
  const { cut = true, feedLines = 3 } = options
  const bytes: number[] = [
    ESC, 0x40, // ESC @ : initialisation
    ESC, 0x74, 0x02, // ESC t 2 : page de code PC850
    ESC, 0x61, 0x00, // alignement à gauche (le centrage est fait par des espaces)
  ]
  let bold = false
  let big = false
  for (const line of ticketTextLines(layoutTicket(data), width)) {
    const wantBold = Boolean(line.bold)
    const wantBig = Boolean(line.big)
    if (wantBold !== bold) {
      bytes.push(ESC, 0x45, wantBold ? 1 : 0) // ESC E n : gras
      bold = wantBold
    }
    if (wantBig !== big) {
      bytes.push(GS, 0x21, wantBig ? 0x01 : 0x00) // GS ! n : double hauteur
      big = wantBig
    }
    bytes.push(...encodeCp850(line.text), LF)
  }
  if (bold) bytes.push(ESC, 0x45, 0)
  if (big) bytes.push(GS, 0x21, 0)
  bytes.push(ESC, 0x64, Math.max(0, Math.min(10, feedLines))) // ESC d n : avance papier
  if (cut) bytes.push(GS, 0x56, 0x42, 0x00) // GS V B 0 : coupe partielle
  return Uint8Array.from(bytes)
}
