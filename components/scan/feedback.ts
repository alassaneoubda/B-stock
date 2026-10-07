'use client'

/**
 * Retour sensoriel d'un scan : bip court (aigu = trouvé, grave = erreur) et
 * vibration sur les téléphones qui la gèrent. Silencieux si le navigateur
 * refuse (pas d'interaction préalable, API absente…).
 */

let audioCtx: AudioContext | null = null

function beep(frequency: number, durationMs: number) {
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    audioCtx ??= new Ctor()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'square'
    osc.frequency.value = frequency
    gain.gain.value = 0.06
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    const now = audioCtx.currentTime
    osc.start(now)
    gain.gain.setValueAtTime(0.06, now + durationMs / 1000 - 0.01)
    gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000)
    osc.stop(now + durationMs / 1000)
  } catch {
    /* audio indisponible */
  }
}

export function scanFeedback(ok: boolean) {
  if (typeof window === 'undefined') return
  beep(ok ? 1800 : 320, ok ? 90 : 220)
  try {
    navigator.vibrate?.(ok ? 60 : [80, 60, 80])
  } catch {
    /* vibration indisponible */
  }
}
