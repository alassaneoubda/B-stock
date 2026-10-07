'use client'

import { useMemo } from 'react'
import { qrSvgPath } from '@/lib/mobile-money/qr'

/** QR code SVG d'un lien de paiement (net à l'impression comme à l'écran). */
export function PaymentQr({ value, size = 184, label }: { value: string; size?: number; label?: string }) {
  const qr = useMemo(() => {
    try {
      return qrSvgPath(value)
    } catch {
      return null
    }
  }, [value])
  if (!qr) return null
  return (
    <svg
      role="img"
      aria-label={label ?? 'QR code du lien de paiement'}
      width={size}
      height={size}
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      shapeRendering="crispEdges"
      className="rounded-lg border border-border bg-white"
    >
      <rect width={qr.size} height={qr.size} fill="#ffffff" />
      <path d={qr.path} fill="#0f172a" />
    </svg>
  )
}
