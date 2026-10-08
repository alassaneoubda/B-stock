import type { PaperWidth } from './ticket'

/**
 * Réglages d'impression des tickets, mémorisés PAR APPAREIL (localStorage) :
 * l'imprimante thermique est branchée à une caisse donnée, et il n'existe pas
 * (encore) de page de paramètres d'impression côté entreprise.
 */

export type PrintSettings = {
  paperWidth: PaperWidth
  /** Mention de bas de ticket. */
  footer: string
  showLogo: boolean
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paperWidth: 80,
  footer: 'Merci de votre visite !',
  showLogo: true,
}

const KEY = 'bstock.print.settings'

export function parsePrintSettings(raw: string | null): PrintSettings {
  if (!raw) return { ...DEFAULT_PRINT_SETTINGS }
  try {
    const v = JSON.parse(raw) as Partial<PrintSettings>
    return {
      paperWidth: v.paperWidth === 58 ? 58 : v.paperWidth === 80 ? 80 : DEFAULT_PRINT_SETTINGS.paperWidth,
      footer: typeof v.footer === 'string' ? v.footer.slice(0, 200) : DEFAULT_PRINT_SETTINGS.footer,
      showLogo: typeof v.showLogo === 'boolean' ? v.showLogo : DEFAULT_PRINT_SETTINGS.showLogo,
    }
  } catch {
    return { ...DEFAULT_PRINT_SETTINGS }
  }
}

export function loadPrintSettings(): PrintSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_PRINT_SETTINGS }
  try {
    return parsePrintSettings(window.localStorage.getItem(KEY))
  } catch {
    return { ...DEFAULT_PRINT_SETTINGS }
  }
}

export function savePrintSettings(settings: PrintSettings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    /* navigation privée / stockage plein : réglage non mémorisé */
  }
}
