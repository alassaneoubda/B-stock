import { BarcodeFormat, EncodeHintType, QRCodeWriter } from '@zxing/library'

/**
 * QR code d'un lien de paiement, sous forme de chemin SVG (une unité = un module).
 * S'appuie sur l'encodeur de @zxing/library, déjà utilisé par le scanner de
 * codes-barres : aucune dépendance supplémentaire.
 */
export function qrSvgPath(text: string, margin = 2): { size: number; path: string } {
  const hints = new Map<EncodeHintType, unknown>()
  hints.set(EncodeHintType.MARGIN, margin)
  hints.set(EncodeHintType.ERROR_CORRECTION, 'M')
  hints.set(EncodeHintType.CHARACTER_SET, 'UTF-8')
  const matrix = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, hints)
  const size = matrix.getWidth()
  let path = ''
  for (let y = 0; y < matrix.getHeight(); y++) {
    for (let x = 0; x < size; x++) {
      if (matrix.get(x, y)) path += `M${x} ${y}h1v1h-1z`
    }
  }
  return { size, path }
}
