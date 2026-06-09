'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

const DISMISS_KEY = 'bstock-a2hs-dismissed'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Invite d'installation "Ajouter à l'écran d'accueil" pour Android/Chrome.
 * On capture l'évènement natif `beforeinstallprompt` afin d'afficher une bannière
 * discrète et de déclencher l'installation au moment choisi par l'utilisateur.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Déjà installée (mode standalone) -> on n'affiche rien.
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (isStandalone) return

    if (localStorage.getItem(DISMISS_KEY) === '1') return

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    const onInstalled = () => {
      setVisible(false)
      setDeferred(null)
      localStorage.setItem(DISMISS_KEY, '1')
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function handleInstall() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice.catch(() => null)
    setVisible(false)
    setDeferred(null)
  }

  function handleDismiss() {
    setVisible(false)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl shadow-zinc-300/40 animate-in slide-in-from-bottom-4 duration-300 sm:inset-x-auto sm:right-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-950">
          <Download className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-950">Installer B-Stock</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Ajoutez l&apos;application à votre écran d&apos;accueil pour un accès rapide, plein écran.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleInstall}
              className="inline-flex h-9 items-center rounded-lg bg-zinc-950 px-4 text-xs font-semibold text-white transition-colors hover:bg-zinc-800"
            >
              Installer
            </button>
            <button
              onClick={handleDismiss}
              className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100"
            >
              Plus tard
            </button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Fermer"
          className="shrink-0 rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
