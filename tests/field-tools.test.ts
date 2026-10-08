import { describe, expect, it } from 'vitest'
import { barcodeCandidates, isPlausibleScan, isValidGtin, normalizeBarcode } from '@/components/scan/barcode-format'
import { createScanDetector } from '@/components/scan/scanner-input'
import {
  layoutTicket,
  pairLine,
  paperColumns,
  ticketMoney,
  ticketTextLines,
  wrapText,
  type TicketData,
} from '@/lib/print/ticket'
import { encodeCp850, encodeTicketEscPos } from '@/lib/print/escpos'
import { parsePrintSettings } from '@/lib/print/settings'

/** Simule une frappe : chaque caractère à `interval` ms d'écart, puis Entrée. */
function type(detector: ReturnType<typeof createScanDetector>, text: string, interval: number, start = 1000) {
  let t = start
  const steps = []
  for (const ch of text) {
    steps.push(detector.push({ key: ch, time: t }))
    t += interval
  }
  steps.push(detector.push({ key: 'Enter', time: t }))
  return steps
}

describe('Codes-barres : fonctions pures', () => {
  it('normalise la saisie (contrôles, espaces, longueur)', () => {
    expect(normalizeBarcode('  6111234567890\r\n')).toBe('6111234567890')
    expect(normalizeBarcode('\u001d0101234')).toBe('0101234')
    expect(normalizeBarcode('')).toBe('')
    expect(normalizeBarcode('A'.repeat(101))).toBe('')
    expect(normalizeBarcode(42)).toBe('')
  })

  it('vérifie la clé de contrôle EAN / UPC', () => {
    expect(isValidGtin('4006381333931')).toBe(true) // EAN-13
    expect(isValidGtin('4006381333932')).toBe(false)
    expect(isValidGtin('96385074')).toBe(true) // EAN-8
    expect(isValidGtin('036000291452')).toBe(true) // UPC-A
    expect(isPlausibleScan('4006381333932', 'ean_13')).toBe(false)
    expect(isPlausibleScan('ABC-123', 'code_128')).toBe(true)
  })

  it('UPC-A et EAN-13 équivalents', () => {
    expect(barcodeCandidates('036000291452')).toEqual(['036000291452', '0036000291452'])
    expect(barcodeCandidates('0036000291452')).toEqual(['0036000291452', '036000291452'])
    expect(barcodeCandidates('ABC')).toEqual(['ABC'])
  })
})

describe('Lecteur clavier (USB / Bluetooth) : détection de scan', () => {
  it('rafale rapide terminée par Entrée = scan', () => {
    const d = createScanDetector()
    const steps = type(d, '6111234567890', 8)
    expect(steps[0]).toEqual({ type: 'char', burstStart: true })
    expect(steps.at(-1)).toEqual({ type: 'scan', code: '6111234567890' })
  })

  it('saisie humaine (lente) puis Entrée : ignorée', () => {
    const d = createScanDetector()
    expect(type(d, '6111234567890', 140).at(-1)).toEqual({ type: 'ignore' })
    // Rythme irrégulier mais moyen trop lent pour un lecteur
    const d2 = createScanDetector()
    expect(type(d2, '12345', 70).at(-1)).toEqual({ type: 'ignore' })
  })

  it('code trop court ou Entrée tardive : ignoré', () => {
    const d = createScanDetector()
    expect(type(d, '123', 5).at(-1)).toEqual({ type: 'ignore' })
    const d2 = createScanDetector()
    d2.push({ key: '1', time: 0 })
    d2.push({ key: '2', time: 10 })
    d2.push({ key: '3', time: 20 })
    d2.push({ key: '4', time: 30 })
    expect(d2.push({ key: 'Enter', time: 500 })).toEqual({ type: 'ignore' })
  })

  it('une pause coupe la rafale : seul le dernier code compte', () => {
    const d = createScanDetector()
    d.push({ key: 'x', time: 0 })
    d.push({ key: 'y', time: 10 })
    // 400 ms plus tard, le lecteur envoie le vrai code
    const steps = type(d, '96385074', 6, 410)
    expect(steps[0]).toEqual({ type: 'char', burstStart: true })
    expect(steps.at(-1)).toEqual({ type: 'scan', code: '96385074' })
  })

  it('raccourcis clavier et touches répétées ne déclenchent rien', () => {
    const d = createScanDetector()
    d.push({ key: '1', time: 0 })
    d.push({ key: '2', time: 5 })
    d.push({ key: 'v', time: 10, ctrlKey: true })
    d.push({ key: '3', time: 15 })
    expect(d.push({ key: 'Enter', time: 20 })).toEqual({ type: 'ignore' })

    const d2 = createScanDetector()
    for (let i = 0; i < 6; i++) d2.push({ key: 'a', time: i * 30, repeat: i > 0 })
    expect(d2.push({ key: 'Enter', time: 200 })).toEqual({ type: 'ignore' })
  })

  it('Maj ne casse pas la rafale (Code 128 en majuscules)', () => {
    const d = createScanDetector()
    let t = 0
    for (const ch of 'AB-12') {
      d.push({ key: 'Shift', time: t })
      d.push({ key: ch, time: t + 2 })
      t += 10
    }
    expect(d.push({ key: 'Enter', time: t })).toEqual({ type: 'scan', code: 'AB-12' })
  })

  it('options explicitement undefined (cas du hook) : valeurs par défaut', () => {
    const d = createScanDetector({ minLength: undefined, maxInterKeyMs: undefined, maxAvgInterKeyMs: undefined, terminators: undefined })
    expect(type(d, '6111234567890', 8).at(-1)).toEqual({ type: 'scan', code: '6111234567890' })
    expect(type(d, '6111234567890', 140, 5000).at(-1)).toEqual({ type: 'ignore' })
  })

  it('options : longueur minimale et terminateur Tab', () => {
    const d = createScanDetector({ minLength: 8, terminators: ['Enter', 'Tab'] })
    expect(type(d, '1234567', 5).at(-1)).toEqual({ type: 'ignore' })
    d.push({ key: '1', time: 0 })
    for (let i = 2; i <= 8; i++) d.push({ key: String(i), time: i * 5 })
    expect(d.push({ key: 'Tab', time: 50 })).toEqual({ type: 'scan', code: '12345678' })
  })
})

const sample: TicketData = {
  company: { name: 'Dépôt Kassi', address: 'Yopougon, Abidjan', phone: '07 00 00 00 00', logoUrl: '/logo.png' },
  title: 'Ticket',
  number: 'T-0042',
  date: '2026-10-07T14:05:00Z',
  meta: [
    { label: 'Client', value: 'Maquis Chez Ange' },
    { label: 'Table', value: '' },
  ],
  lines: [
    { name: 'Bock 65 cl Casier 12', quantity: 2, unitPrice: 7500 },
    { name: 'Coca-Cola 33 cl', quantity: 12, unitPrice: 350 },
  ],
  deposits: [{ name: 'Casier 12', quantityOut: 2, quantityIn: 1, unitPrice: 3000 }],
  total: 22200,
  paid: 25000,
  paymentLabel: 'Espèces',
  change: 2800,
  footer: 'Merci de votre visite !',
}

describe('Ticket thermique : mise en page', () => {
  it('montants lisibles sur papier (espaces ordinaires)', () => {
    expect(ticketMoney(22200)).toBe('22 200 FCFA')
    expect(ticketMoney(1234567.6)).toBe('1 234 568 FCFA')
  })

  it('contient en-tête, lignes, consignes, total, payé, rendu et mention', () => {
    const rows = layoutTicket(sample, { withLogo: true })
    const text = JSON.stringify(rows)
    expect(rows[0]).toEqual({ kind: 'logo', src: '/logo.png' })
    for (const s of ['Dépôt Kassi', 'Ticket T-0042', 'Maquis Chez Ange', 'Bock 65 cl Casier 12', 'Consignes', '22 200 FCFA', 'Payé (Espèces)', 'Rendu', '2 800 FCFA', 'Merci de votre visite !']) {
      expect(text).toContain(s)
    }
    // Méta vide (table) omise
    expect(text).not.toContain('"Table"')
    // Consigne nette : (2 - 1) × 3 000
    expect(rows).toContainEqual({ kind: 'pair', left: '  Casier 12 +2 -1 rendu(s)', right: '3 000 FCFA' })
  })

  it('aucune ligne ne dépasse la largeur du rouleau (58 et 80 mm)', () => {
    for (const width of [58, 80] as const) {
      const cols = paperColumns(width)
      const lines = ticketTextLines(layoutTicket({ ...sample, lines: [...sample.lines, { name: 'Un nom de produit extrêmement long qui doit être replié proprement', quantity: 120, unitPrice: 125000 }] }), width)
      for (const l of lines) expect(l.text.length).toBeLessThanOrEqual(cols)
      const total = lines.find((l) => l.text.startsWith('TOTAL'))!
      expect(total.text.length).toBe(cols)
      expect(total.text.endsWith('22 200 FCFA')).toBe(true)
      expect(total.bold && total.big).toBe(true)
    }
  })

  it('outils de colonnes', () => {
    expect(pairLine('Payé', '500 FCFA', 20)).toBe('Payé        500 FCFA')
    expect(pairLine('Un libellé beaucoup trop long', '500 FCFA', 20)).toBe('Un libellé. 500 FCFA')
    expect(wrapText('Bière Flag Spéciale 65 cl', 10)).toEqual(['Bière Flag', 'Spéciale', '65 cl'])
    expect(wrapText('ABCDEFGHIJKL', 5)).toEqual(['ABCDE', 'FGHIJ', 'KL'])
  })

  it('reste à payer affiché pour une vente à crédit', () => {
    const rows = layoutTicket({ ...sample, paid: 0, change: 0, due: 22200 })
    expect(rows).toContainEqual({ kind: 'pair', left: 'Reste à payer', right: '22 200 FCFA', bold: true })
    expect(JSON.stringify(rows)).not.toContain('Rendu')
  })
})

describe('Encodage ESC/POS', () => {
  it('accents français en page de code PC850', () => {
    expect(encodeCp850('é è à ç ô É')).toEqual([0x82, 0x20, 0x8a, 0x20, 0x85, 0x20, 0x87, 0x20, 0x93, 0x20, 0x90])
    expect(encodeCp850('Bœuf – 5 €')).toEqual([...Buffer.from('Boeuf - 5 EUR', 'ascii')])
    expect(encodeCp850('ŵ')).toEqual([...Buffer.from('w', 'ascii')])
    expect(encodeCp850('漢')).toEqual([0x3f])
  })

  it('séquence complète : init, page de code, texte, gras, coupe', () => {
    const bytes = encodeTicketEscPos(sample, 58)
    expect([...bytes.slice(0, 5)]).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x02])
    expect([...bytes.slice(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00])
    const ascii = Buffer.from(bytes).toString('latin1')
    expect(ascii).toContain('TOTAL')
    expect(ascii).toContain('22 200 FCFA')
    // Gras activé puis désactivé
    expect(ascii).toContain('\x1bE\x01')
    expect(ascii).toContain('\x1bE\x00')
    // « Dépôt » encodé en PC850 (é = 0x82, ô = 0x93)
    expect([...bytes]).toEqual(expect.arrayContaining([0x44, 0x82, 0x70, 0x93, 0x74]))
    const noCut = encodeTicketEscPos(sample, 80, { cut: false })
    expect([...noCut.slice(-3)]).toEqual([0x1b, 0x64, 0x03])
  })
})

describe('Réglages d’impression', () => {
  it('valeurs par défaut et valeurs invalides ignorées', () => {
    expect(parsePrintSettings(null).paperWidth).toBe(80)
    expect(parsePrintSettings('{"paperWidth":58,"footer":"Bonne journée","showLogo":false}')).toEqual({
      paperWidth: 58,
      footer: 'Bonne journée',
      showLogo: false,
    })
    expect(parsePrintSettings('{"paperWidth":72}').paperWidth).toBe(80)
    expect(parsePrintSettings('pas du json').footer).toBe('Merci de votre visite !')
  })
})
