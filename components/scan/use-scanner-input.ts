'use client'

import { useEffect, useRef } from 'react'
import { createScanDetector, type ScanDetectorOptions } from './scanner-input'

type Editable = HTMLInputElement | HTMLTextAreaElement

function asEditable(target: EventTarget | null): Editable | null {
  if (target instanceof HTMLTextAreaElement) return target
  if (target instanceof HTMLInputElement) return target
  return null
}

/** Remet une valeur dans un champ contrôlé par React (setter natif + événement input). */
function restoreValue(el: Editable, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  try {
    setter ? setter.call(el, value) : (el.value = value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  } catch {
    /* champ de type exotique : on laisse la saisie telle quelle */
  }
}

export type UseScannerInputOptions = ScanDetectorOptions & {
  /** Désactive l'écoute (ex. une boîte de dialogue est ouverte). Défaut : true. */
  enabled?: boolean
}

/**
 * Écoute les lecteurs de codes-barres « clavier » (USB / Bluetooth HID) sur
 * toute la page. Une rafale très rapide terminée par Entrée déclenche
 * `onScan(code)` ; l'Entrée est alors bloquée (pas de soumission de
 * formulaire) et, si le curseur était dans un champ, les caractères tapés par
 * le lecteur y sont retirés. La saisie humaine n'est jamais interceptée.
 *
 * Les champs (ou conteneurs) marqués `data-scanner-ignore` gèrent eux-mêmes
 * le lecteur (ex. champ « Code-barres » d'une fiche produit).
 */
export function useScannerInput(onScan: (code: string) => void, options: UseScannerInputOptions = {}) {
  const { enabled = true, minLength, maxInterKeyMs, maxAvgInterKeyMs, terminators } = options
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  })

  const terminatorsKey = terminators?.join('|')

  useEffect(() => {
    if (!enabled) return
    const detector = createScanDetector({
      minLength,
      maxInterKeyMs,
      maxAvgInterKeyMs,
      terminators: terminatorsKey ? terminatorsKey.split('|') : undefined,
    })
    let snapshot: { el: Editable; value: string } | null = null

    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return
      const target = e.target as Element | null
      if (target && typeof target.closest === 'function' && target.closest('[data-scanner-ignore]')) {
        detector.reset()
        return
      }
      const step = detector.push({
        key: e.key,
        time: e.timeStamp || performance.now(),
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        repeat: e.repeat,
      })
      if (step.type === 'char' && step.burstStart) {
        const el = asEditable(e.target)
        snapshot = el ? { el, value: el.value } : null
      } else if (step.type === 'scan') {
        e.preventDefault()
        e.stopPropagation()
        const snap = snapshot
        snapshot = null
        if (snap && snap.el.isConnected && snap.el.value !== snap.value) {
          // Le keydown précède l'insertion du dernier caractère : on attend la fin du cycle
          setTimeout(() => restoreValue(snap.el, snap.value), 0)
        }
        onScanRef.current(step.code)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [enabled, minLength, maxInterKeyMs, maxAvgInterKeyMs, terminatorsKey])
}
