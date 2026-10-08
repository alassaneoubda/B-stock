'use client'

import { SCAN_FORMATS } from './barcode-format'

/**
 * Moteur de décodage des images caméra :
 *  - API native `BarcodeDetector` quand elle existe (Chrome / Edge Android,
 *    ChromeOS, macOS) : rapide, sans téléchargement ;
 *  - sinon repli JavaScript ZXing (@zxing/browser), chargé à la demande par
 *    import dynamique pour ne pas alourdir les pages (~110 Ko gzip).
 */

export type Detection = { code: string; format: string }

export type FrameDetector = {
  kind: 'native' | 'zxing'
  detect: (source: HTMLVideoElement | HTMLCanvasElement) => Promise<Detection | null>
}

// L'API BarcodeDetector n'est pas encore décrite par lib.dom de TypeScript
type NativeBarcode = { rawValue: string; format: string }
type NativeBarcodeDetector = { detect: (source: CanvasImageSource) => Promise<NativeBarcode[]> }
type NativeBarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): NativeBarcodeDetector
  getSupportedFormats?: () => Promise<string[]>
}

function nativeCtor(): NativeBarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null
  const ctor = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorCtor }).BarcodeDetector
  return typeof ctor === 'function' ? ctor : null
}

async function createNative(): Promise<FrameDetector | null> {
  const Ctor = nativeCtor()
  if (!Ctor) return null
  try {
    const supported = (await Ctor.getSupportedFormats?.()) ?? [...SCAN_FORMATS]
    const formats = SCAN_FORMATS.filter((f) => supported.includes(f))
    // Ex. Chrome desktop Windows : API présente mais sans aucun format → repli ZXing
    if (formats.length === 0) return null
    const detector = new Ctor({ formats })
    return {
      kind: 'native',
      async detect(source) {
        const found = await detector.detect(source)
        const first = found.find((b) => b.rawValue)
        return first ? { code: first.rawValue, format: first.format } : null
      },
    }
  } catch {
    return null
  }
}

const ZXING_FORMAT_NAMES: Record<number, string> = {}

async function createZxing(): Promise<FrameDetector> {
  const [{ BrowserMultiFormatReader }, lib] = await Promise.all([import('@zxing/browser'), import('@zxing/library')])
  const { BarcodeFormat, DecodeHintType } = lib
  const formats = [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.QR_CODE,
  ]
  Object.assign(ZXING_FORMAT_NAMES, {
    [BarcodeFormat.EAN_13]: 'ean_13',
    [BarcodeFormat.EAN_8]: 'ean_8',
    [BarcodeFormat.UPC_A]: 'upc_a',
    [BarcodeFormat.UPC_E]: 'upc_e',
    [BarcodeFormat.CODE_128]: 'code_128',
    [BarcodeFormat.QR_CODE]: 'qr_code',
  })
  const hints = new Map<number, unknown>([[DecodeHintType.POSSIBLE_FORMATS, formats]])
  const reader = new BrowserMultiFormatReader(hints as Map<never, unknown>)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  return {
    kind: 'zxing',
    async detect(source) {
      if (!ctx) return null
      let target: HTMLCanvasElement
      if (source instanceof HTMLVideoElement) {
        const vw = source.videoWidth
        const vh = source.videoHeight
        if (!vw || !vh) return null
        // Zone centrale (là où se trouve le cadre de visée), réduite à 720 px max :
        // décodage plus rapide et plus fiable sur les téléphones d'entrée de gamme
        const sw = Math.round(vw * 0.8)
        const sh = Math.round(vh * 0.6)
        const sx = Math.round((vw - sw) / 2)
        const sy = Math.round((vh - sh) / 2)
        const scale = Math.min(1, 720 / sw)
        canvas.width = Math.round(sw * scale)
        canvas.height = Math.round(sh * scale)
        ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
        target = canvas
      } else {
        target = source
      }
      try {
        const result = reader.decodeFromCanvas(target)
        const text = result.getText()
        return text ? { code: text, format: ZXING_FORMAT_NAMES[result.getBarcodeFormat()] ?? '' } : null
      } catch {
        // NotFoundException à chaque image sans code : c'est le cas normal
        return null
      }
    },
  }
}

/** Crée le meilleur moteur disponible (natif, sinon ZXing). */
export async function createFrameDetector(): Promise<FrameDetector> {
  return (await createNative()) ?? (await createZxing())
}
