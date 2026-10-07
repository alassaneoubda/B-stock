import { normalizeBarcode } from './barcode-format'

/**
 * Détection des lecteurs de codes-barres USB / Bluetooth en mode « clavier »
 * (HID) : ils tapent le code caractère par caractère, très vite (5 à 40 ms
 * entre deux touches), puis envoient Entrée. Un humain tape beaucoup plus
 * lentement : une rafale rapide terminée par Entrée est donc traitée comme un
 * scan, toute autre frappe est laissée intacte.
 *
 * Module pur (sans DOM) : testé unitairement, utilisé par useScannerInput.
 */

export type ScanDetectorOptions = {
  /** Longueur minimale d'un code (défaut 4). */
  minLength?: number
  /** Écart maximal entre deux caractères d'une même rafale, en ms (défaut 100). */
  maxInterKeyMs?: number
  /** Écart moyen maximal sur la rafale, en ms (défaut 45). */
  maxAvgInterKeyMs?: number
  /** Touches de fin de code (défaut : Entrée). */
  terminators?: string[]
}

export type ScanKey = {
  key: string
  /** Horodatage en ms (event.timeStamp ou performance.now()). */
  time: number
  ctrlKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  /** Touche maintenue (répétition automatique). */
  repeat?: boolean
}

export type ScanStep =
  /** Caractère mis en mémoire ; `burstStart` = premier caractère d'une rafale. */
  | { type: 'char'; burstStart: boolean }
  /** Rafale rapide terminée : c'est un scan. */
  | { type: 'scan'; code: string }
  /** Touche sans rapport (ou terminateur d'une saisie humaine) : rien à faire. */
  | { type: 'ignore' }

export const SCAN_DEFAULTS = {
  minLength: 4,
  maxInterKeyMs: 100,
  maxAvgInterKeyMs: 45,
  terminators: ['Enter'],
} satisfies Required<ScanDetectorOptions>

export function createScanDetector(options: ScanDetectorOptions = {}) {
  // Options absentes ou `undefined` → valeurs par défaut
  const opts = {
    minLength: options.minLength ?? SCAN_DEFAULTS.minLength,
    maxInterKeyMs: options.maxInterKeyMs ?? SCAN_DEFAULTS.maxInterKeyMs,
    maxAvgInterKeyMs: options.maxAvgInterKeyMs ?? SCAN_DEFAULTS.maxAvgInterKeyMs,
    terminators: options.terminators?.length ? options.terminators : SCAN_DEFAULTS.terminators,
  }
  let chars: string[] = []
  let times: number[] = []

  function reset() {
    chars = []
    times = []
  }

  function push(e: ScanKey): ScanStep {
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) {
      reset()
      return { type: 'ignore' }
    }

    if (opts.terminators.includes(e.key)) {
      const buffered = chars.join('')
      const stamps = times
      reset()
      if (buffered.length < opts.minLength || stamps.length < 2) return { type: 'ignore' }
      // L'Entrée doit suivre immédiatement le dernier caractère
      if (e.time - stamps[stamps.length - 1] > opts.maxInterKeyMs) return { type: 'ignore' }
      const avg = (stamps[stamps.length - 1] - stamps[0]) / (stamps.length - 1)
      if (avg > opts.maxAvgInterKeyMs) return { type: 'ignore' }
      const code = normalizeBarcode(buffered)
      return code ? { type: 'scan', code } : { type: 'ignore' }
    }

    if (e.key.length === 1) {
      const last = times[times.length - 1]
      if (last === undefined || e.time - last > opts.maxInterKeyMs) {
        chars = [e.key]
        times = [e.time]
        return { type: 'char', burstStart: true }
      }
      chars.push(e.key)
      times.push(e.time)
      return { type: 'char', burstStart: false }
    }

    // Maj seule ne casse pas une rafale (lettres majuscules d'un Code 128)
    if (e.key === 'Shift') return { type: 'ignore' }
    reset()
    return { type: 'ignore' }
  }

  return {
    push,
    reset,
    get buffer() {
      return chars.join('')
    },
  }
}
