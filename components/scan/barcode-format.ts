/**
 * Fonctions pures autour des codes-barres (aucune dépendance navigateur) :
 * partagées par le scanner caméra, le lecteur clavier et l'API de recherche.
 */

/** Longueur maximale stockée en base (product_variants.barcode VARCHAR(100)). */
export const BARCODE_MAX_LENGTH = 100

/** Formats lus par le scanner (noms de l'API BarcodeDetector). */
export const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'] as const
export type ScanFormat = (typeof SCAN_FORMATS)[number]

/**
 * Nettoie une saisie : retire caractères de contrôle (préfixes/suffixes de
 * certains lecteurs, ex. \r, \t, GS des GS1-128) et espaces aux extrémités.
 * Renvoie '' si rien d'exploitable.
 */
export function normalizeBarcode(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!cleaned || cleaned.length > BARCODE_MAX_LENGTH) return ''
  return cleaned
}

/** Clé de contrôle EAN/UPC (modulo 10, pondération 3/1 depuis la droite). */
function gtinCheckDigitValid(code: string): boolean {
  if (!/^\d+$/.test(code)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()!
  let sum = 0
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w
  return (10 - (sum % 10)) % 10 === check
}

/** EAN-8, UPC-A (12), EAN-13, GTIN-14 avec clé de contrôle valide. */
export function isValidGtin(code: string): boolean {
  return [8, 12, 13, 14].includes(code.length) && gtinCheckDigitValid(code)
}

/**
 * Variantes équivalentes d'un même code, pour la recherche en base :
 * un UPC-A (12 chiffres) est lu « 0 + UPC » en EAN-13 par certains appareils,
 * et inversement. Le code saisi reste toujours en premier.
 */
export function barcodeCandidates(code: string): string[] {
  const out = [code]
  if (/^\d{12}$/.test(code)) out.push(`0${code}`)
  if (/^0\d{12}$/.test(code)) out.push(code.slice(1))
  return out
}

/**
 * Lecture caméra plausible ? Les codes EAN/UPC doivent avoir une clé valide
 * (les lectures partielles du décodeur JavaScript sont ainsi écartées) ; les
 * autres formats (Code 128, QR) sont acceptés tels quels.
 */
export function isPlausibleScan(code: string, format?: string | null): boolean {
  if (!code) return false
  const f = (format ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (f === 'ean13' || f === 'ean8' || f === 'upca') return isValidGtin(code)
  if (f === 'upce') return /^\d{6,8}$/.test(code)
  return true
}
