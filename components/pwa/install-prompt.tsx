'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Share, SquarePlus } from 'lucide-react'
import { BrandMonogram } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** Dernier affichage de la popup (horodatage ms) : au plus une fois par 24 h. */
const LAST_SHOWN_KEY = 'bstock-install-prompt-last'
/** Application installée : la popup ne revient plus. */
const INSTALLED_KEY = 'bstock-install-prompt-installed'
const ONE_DAY_MS = 24 * 60 * 60 * 1000

// Écrans où une popup gênerait : back-office et caisse du point de vente.
const EXCLUDED_PREFIXES = ['/admin', '/pos', '/preview']

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Mode = 'native' | 'ios' | null

function readNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0
  } catch {
    return 0
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // stockage indisponible (navigation privée) : la popup pourra revenir, sans gravité
  }
}

/** Faut-il proposer l'installation maintenant ? (pas installée, pas déjà vue depuis 24 h) */
function isDue(): boolean {
  if (readNumber(INSTALLED_KEY) > 0) return false
  return Date.now() - readNumber(LAST_SHOWN_KEY) >= ONE_DAY_MS
}

/**
 * Popup « Installer B-Stock » (PWA).
 *  - Android / Chrome / Edge : on capture `beforeinstallprompt` ; le bouton lance l'installation native.
 *  - iOS / Safari : pas d'installation par script → on affiche les étapes (Partager → Sur l'écran d'accueil).
 * Affichée au plus une fois par jour : refusée ou ignorée, elle ne revient qu'après 24 h.
 * Jamais si l'application tourne déjà en mode installé.
 */
export function InstallPrompt() {
  const pathname = usePathname()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [mode, setMode] = useState<Mode>(null)
  const [open, setOpen] = useState(false)

  const excluded = EXCLUDED_PREFIXES.some((p) => pathname === p || pathname?.startsWith(p + '/'))

  useEffect(() => {
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (isStandalone) {
      write(INSTALLED_KEY, String(Date.now()))
      return
    }

    const ua = window.navigator.userAgent
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      // iPadOS se fait passer pour un Mac
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
    // Sur iOS, seul Safari peut « Ajouter à l'écran d'accueil ».
    if (isIOS && /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua)) {
      setMode('ios')
      return
    }

    const onPrompt = (e: Event) => {
      e.preventDefault() // on garde l'événement pour notre propre bouton
      setDeferred(e as BeforeInstallPromptEvent)
      setMode('native')
    }
    const onInstalled = () => {
      write(INSTALLED_KEY, String(Date.now()))
      setOpen(false)
      setDeferred(null)
      setMode(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Ouverture : installable, pas sur un écran exclu, et pas déjà proposée depuis 24 h.
  useEffect(() => {
    if (!mode || excluded || open || !isDue()) return
    // Petit délai : la page s'affiche d'abord, la popup ensuite
    const timer = window.setTimeout(() => {
      if (!isDue()) return
      write(LAST_SHOWN_KEY, String(Date.now())) // compté dès l'affichage : une seule fois par jour
      setOpen(true)
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [mode, excluded, open])

  async function handleInstall() {
    if (!deferred) return
    setOpen(false)
    await deferred.prompt()
    const choice = await deferred.userChoice.catch(() => null)
    if (choice?.outcome === 'accepted') write(INSTALLED_KEY, String(Date.now()))
    // Refus dans la fenêtre native : la popup reviendra dans 24 h (déjà horodatée)
    setDeferred(null)
  }

  if (!mode) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center sm:items-center sm:text-center">
          <BrandMonogram size={52} />
          <DialogTitle className="pt-2">Installer B-Stock</DialogTitle>
          <DialogDescription>
            Ajoutez l’application à votre écran d’accueil : ouverture en un geste, plein écran, comme une
            application classique.
          </DialogDescription>
        </DialogHeader>

        {mode === 'ios' && (
          <ol className="space-y-2 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span className="font-semibold text-foreground">1.</span>
              Appuyez sur
              <Share className="h-4 w-4 text-brand-strong" aria-hidden="true" />
              <span className="font-medium text-foreground">Partager</span>
            </li>
            <li className="flex items-center gap-1.5">
              <span className="font-semibold text-foreground">2.</span>
              Choisissez
              <SquarePlus className="h-4 w-4 text-foreground/80" aria-hidden="true" />
              <span className="font-medium text-foreground">Sur l’écran d’accueil</span>
            </li>
            <li className="flex items-center gap-1.5">
              <span className="font-semibold text-foreground">3.</span>
              Appuyez sur <span className="font-medium text-foreground">Ajouter</span>
            </li>
          </ol>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {mode === 'native' ? (
            <>
              <Button variant="brand" size="lg" className="w-full" onClick={handleInstall}>
                Installer
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setOpen(false)}>
                Plus tard
              </Button>
            </>
          ) : (
            <Button variant="brand" size="lg" className="w-full" onClick={() => setOpen(false)}>
              J’ai compris
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
