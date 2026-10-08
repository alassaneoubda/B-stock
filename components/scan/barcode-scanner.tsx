'use client'

import { useEffect, useRef, useState, type ComponentProps, type FormEvent } from 'react'
import { AlertTriangle, CameraOff, CheckCircle2, Flashlight, FlashlightOff, Keyboard, Loader2, RotateCw, ScanBarcode, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { isPlausibleScan, normalizeBarcode } from './barcode-format'
import { createFrameDetector, type Detection, type FrameDetector } from './detector'
import { scanFeedback } from './feedback'

/**
 * Résultat renvoyé par l'écran appelant après un scan :
 *  - ok      : bip aigu (true) ou grave (false) ;
 *  - message : affiché sous la vidéo (« Ajouté : Bock 66 cl ») ;
 *  - close   : ferme le scanner (ex. code inconnu → proposition d'association).
 */
export type ScanOutcome = { ok: boolean; message?: string; close?: boolean } | void

export type ScanHandler = (code: string) => ScanOutcome | Promise<ScanOutcome>

type ScannerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDetected: ScanHandler
  title?: string
  description?: string
  /** Rester ouvert après un scan réussi (lecture d'une série d'articles). */
  continuous?: boolean
}

/** Scanner caméra plein écran sur mobile, avec saisie manuelle de secours. */
export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onDetected,
  title = 'Scanner un code-barres',
  description = 'Placez le code-barres dans le cadre. La lecture est automatique.',
  continuous = false,
}: ScannerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-dvh max-h-dvh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-xl sm:border"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-b border-border px-4 py-3 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanBarcode className="h-5 w-5 text-brand-strong" aria-hidden="true" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>
        {open && <ScannerBody onDetected={onDetected} continuous={continuous} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function cameraErrorMessage(error: unknown): string {
  const name = (error as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Accès à la caméra refusé. Autorisez la caméra pour ce site (icône à gauche de l’adresse, puis Autorisations), ou saisissez le code ci-dessous.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Aucune caméra détectée sur cet appareil.'
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'La caméra est déjà utilisée par une autre application. Fermez-la puis réessayez.'
  }
  return 'Impossible de démarrer la caméra. Saisissez le code ci-dessous.'
}

type Feedback = { ok: boolean; message: string; code: string } | null

function ScannerBody({
  onDetected,
  continuous,
  onClose,
}: {
  onDetected: ScanHandler
  continuous: boolean
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const pausedRef = useRef(false)
  const lastAcceptedRef = useRef<{ code: string; at: number } | null>(null)
  const candidateRef = useRef<string | null>(null)
  const handlerRef = useRef({ onDetected, continuous, onClose })
  useEffect(() => {
    handlerRef.current = { onDetected, continuous, onClose }
  })

  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting')
  const [error, setError] = useState<string | null>(null)
  const [engine, setEngine] = useState<FrameDetector['kind'] | null>(null)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  async function submitCode(code: string) {
    pausedRef.current = true
    setBusy(true)
    let outcome: ScanOutcome
    try {
      outcome = await handlerRef.current.onDetected(code)
    } catch {
      outcome = { ok: false, message: 'Erreur pendant le traitement du code.' }
    }
    const ok = outcome ? outcome.ok : true
    scanFeedback(ok)
    setFeedback({ ok, code, message: outcome?.message ?? (ok ? 'Code lu' : 'Code refusé') })
    setBusy(false)
    if (outcome?.close || (ok && !handlerRef.current.continuous)) {
      handlerRef.current.onClose()
      return
    }
    // Petite pause : laisse le temps d'écarter l'article avant la lecture suivante
    setTimeout(() => {
      pausedRef.current = false
    }, 700)
  }

  function onDetection(d: Detection, kind: FrameDetector['kind']) {
    const code = normalizeBarcode(d.code)
    if (!code || !isPlausibleScan(code, d.format)) return
    // Repli JavaScript : un Code 128 / QR doit être lu deux fois de suite à l'identique
    const checksummed = /ean|upc/i.test(d.format)
    if (kind === 'zxing' && !checksummed && candidateRef.current !== code) {
      candidateRef.current = code
      return
    }
    candidateRef.current = null
    const last = lastAcceptedRef.current
    const now = Date.now()
    if (last && last.code === code && now - last.at < 2000) return
    lastAcceptedRef.current = { code, at: now }
    void submitCode(code)
  }

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let detector: FrameDetector | null = null

    function stop() {
      if (timer) clearTimeout(timer)
      timer = undefined
      stream?.getTracks().forEach((t) => t.stop())
      stream = null
      trackRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      setTorchOn(false)
    }

    async function loop() {
      if (cancelled || !stream || !detector) return
      const video = videoRef.current
      if (video && !pausedRef.current && video.readyState >= 2) {
        const d = await detector.detect(video).catch(() => null)
        if (d && !cancelled) onDetection(d, detector.kind)
      }
      if (!cancelled && stream) timer = setTimeout(loop, detector.kind === 'native' ? 120 : 200)
    }

    async function start() {
      setStatus('starting')
      setError(null)
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error')
        setError(
          window.isSecureContext
            ? 'Ce navigateur ne permet pas d’utiliser la caméra. Saisissez le code ci-dessous.'
            : 'La caméra n’est disponible que sur une connexion sécurisée (https). Saisissez le code ci-dessous.'
        )
        return
      }
      try {
        detector ??= await createFrameDetector()
      } catch {
        if (cancelled) return
        setStatus('error')
        setError('Le lecteur de codes-barres n’a pas pu être chargé (connexion ?). Saisissez le code ci-dessous.')
        return
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        const track = s.getVideoTracks()[0] ?? null
        trackRef.current = track
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean }
        setTorchAvailable(Boolean(caps.torch))
        setEngine(detector.kind)
        const video = videoRef.current
        if (video) {
          video.srcObject = s
          await video.play().catch(() => {})
        }
        setStatus('scanning')
        void loop()
      } catch (e) {
        if (cancelled) return
        stop()
        setStatus('error')
        setError(cameraErrorMessage(e))
      }
    }

    // Application en arrière-plan : on libère la caméra, on la reprend au retour
    function onVisibility() {
      if (document.hidden) stop()
      else if (!cancelled && !stream) void start()
    }

    document.addEventListener('visibilitychange', onVisibility)
    void start()
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey])

  async function toggleTorch() {
    const track = trackRef.current
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] })
      setTorchOn(!torchOn)
    } catch {
      setTorchAvailable(false)
    }
  }

  function onManualSubmit(e: FormEvent) {
    e.preventDefault()
    const code = normalizeBarcode(manual)
    if (!code || busy) return
    setManual('')
    lastAcceptedRef.current = { code, at: Date.now() }
    void submitCode(code)
  }

  return (
    <>
      <div className="relative min-h-0 flex-1 bg-black sm:aspect-[4/3] sm:flex-none">
        <video
          ref={videoRef}
          className={cn('h-full w-full object-cover', status !== 'scanning' && 'invisible')}
          playsInline
          muted
          autoPlay
          aria-label="Image de la caméra"
        />

        {status === 'scanning' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <div
              className={cn(
                'relative h-[42%] w-[82%] max-w-md rounded-2xl border-2 shadow-[0_0_0_9999px_rgb(0_0_0/0.45)] transition-colors duration-200',
                feedback && busy === false && feedback.ok ? 'border-success' : 'border-white/85'
              )}
            >
              <span className="absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 animate-pulse rounded-full bg-brand" />
            </div>
          </div>
        )}

        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/90">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
            <p className="text-sm">Démarrage de la caméra…</p>
          </div>
        )}

        {status === 'error' && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
            <CameraOff className="h-10 w-10 text-white/80" aria-hidden="true" />
            <p className="max-w-sm text-sm leading-relaxed">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => setRetryKey((k) => k + 1)}>
              <RotateCw aria-hidden="true" /> Réessayer
            </Button>
          </div>
        )}

        {status === 'scanning' && torchAvailable && (
          <Button
            type="button"
            variant="secondary"
            size="icon-lg"
            className="absolute bottom-4 right-4 rounded-full bg-black/60 text-white hover:bg-black/75"
            onClick={() => void toggleTorch()}
            aria-pressed={torchOn}
            aria-label={torchOn ? 'Éteindre la lampe' : 'Allumer la lampe'}
          >
            {torchOn ? <FlashlightOff /> : <Flashlight />}
          </Button>
        )}

        {status === 'scanning' && engine === 'zxing' && (
          <span className="absolute bottom-4 left-4 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white/80">
            Lecteur compatible
          </span>
        )}
      </div>

      <div className="space-y-3 border-t border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div aria-live="polite" className="min-h-10">
          {busy ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Recherche du produit…
            </p>
          ) : feedback ? (
            <p className={cn('flex items-start gap-2 text-sm font-medium', feedback.ok ? 'text-success' : 'text-destructive')}>
              {feedback.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span className="min-w-0">
                {feedback.message}
                <span className="block font-mono text-xs font-normal text-muted-foreground">{feedback.code}</span>
              </span>
            </p>
          ) : status === 'scanning' ? (
            <p className="text-sm text-muted-foreground">
              {continuous ? 'Scannez les articles les uns après les autres.' : 'En attente d’un code-barres…'}
            </p>
          ) : status === 'error' ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Saisie manuelle disponible ci-dessous.
            </p>
          ) : null}
        </div>

        <form onSubmit={onManualSubmit} className="flex gap-2" data-scanner-ignore>
          <div className="relative min-w-0 flex-1">
            <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Saisir le code manuellement"
              aria-label="Saisir le code-barres manuellement"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="go"
              className="h-11 pl-9 font-mono"
              maxLength={100}
            />
          </div>
          <Button type="submit" size="lg" className="h-11" disabled={!manual.trim() || busy}>
            Valider
          </Button>
        </form>

        {continuous && (
          <Button type="button" variant="outline" className="w-full" onClick={onClose}>
            Terminer
          </Button>
        )}
      </div>
    </>
  )
}

type ScanButtonProps = Omit<ComponentProps<typeof Button>, 'onClick' | 'children'> & {
  onDetected: ScanHandler
  label?: string
  /** Bouton icône seule (le libellé reste lu par les lecteurs d'écran). */
  iconOnly?: boolean
  title?: string
  description?: string
  continuous?: boolean
}

/** Bouton « Scanner » qui ouvre le scanner caméra. */
export function ScanButton({
  onDetected,
  label = 'Scanner',
  iconOnly = false,
  title,
  description,
  continuous = false,
  variant = 'outline',
  ...buttonProps
}: ScanButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant={variant}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        {...buttonProps}
        onClick={() => setOpen(true)}
      >
        <ScanBarcode aria-hidden="true" />
        {!iconOnly && <span>{label}</span>}
      </Button>
      <BarcodeScannerDialog
        open={open}
        onOpenChange={setOpen}
        onDetected={onDetected}
        title={title}
        description={description}
        continuous={continuous}
      />
    </>
  )
}
