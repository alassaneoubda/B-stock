'use client'

import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Bluetooth, Loader2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiFetch } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { PAPER_WIDTHS, type PaperWidth, type TicketData } from '@/lib/print/ticket'
import { encodeTicketEscPos } from '@/lib/print/escpos'
import { DEFAULT_PRINT_SETTINGS, loadPrintSettings, savePrintSettings, type PrintSettings } from '@/lib/print/settings'
import { isBluetoothPrintingSupported, printBytes } from '@/lib/print/bluetooth'
import { ThermalTicket } from './thermal-ticket'
import { VAT_NOT_APPLICABLE } from '@/lib/vat'

/** Ticket sans l'en-tête entreprise : complété automatiquement. */
export type TicketInput = Omit<TicketData, 'company'> & { company?: TicketData['company'] }

type CompanyInfo = TicketData['company'] & {
  /** Entreprise assujettie à la TVA (undefined : inconnu, ex. caissier sans accès aux paramètres). */
  vatEnabled?: boolean
}

// Coordonnées de l'entreprise : chargées une fois par session de page
let companyCache: Promise<Partial<CompanyInfo> | null> | null = null

function fetchCompany(): Promise<Partial<CompanyInfo> | null> {
  companyCache ??= apiFetch<{ data: { name?: string; address?: string | null; phone?: string | null; logo_url?: string | null; tax_id?: string | null; vat_enabled?: boolean } }>(
    '/api/company'
  )
    .then((r) => ({
      name: r.data.name,
      address: r.data.address,
      phone: r.data.phone,
      logoUrl: r.data.logo_url,
      taxId: r.data.tax_id ?? null,
      vatEnabled: r.data.vat_enabled,
    }))
    // Les caissiers n'ont pas toujours accès aux paramètres : nom de session en repli
    .catch(() => null)
  return companyCache
}

/** En-tête entreprise du ticket (nom, adresse, téléphone, logo). */
export function useTicketCompany(): CompanyInfo {
  const { data: session } = useSession()
  const [info, setInfo] = useState<Partial<CompanyInfo> | null>(null)
  useEffect(() => {
    let alive = true
    void fetchCompany().then((c) => alive && setInfo(c))
    return () => {
      alive = false
    }
  }, [])
  return {
    name: info?.name || session?.user?.companyName || 'B-Stock',
    address: info?.address ?? null,
    phone: info?.phone ?? null,
    logoUrl: info?.logoUrl ?? null,
    taxId: info?.taxId ?? null,
    vatEnabled: info?.vatEnabled,
  }
}

/** Réglages d'impression mémorisés sur l'appareil. */
export function usePrintSettings() {
  const [settings, setSettingsState] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS)
  useEffect(() => {
    setSettingsState(loadPrintSettings())
  }, [])
  const setSettings = useCallback((patch: Partial<PrintSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch }
      savePrintSettings(next)
      return next
    })
  }, [])
  return { settings, setSettings }
}

function waitForImages(root: HTMLElement, timeoutMs = 1500): Promise<void> {
  const pending = [...root.querySelectorAll('img')].filter((img) => !img.complete)
  if (pending.length === 0) return Promise.resolve()
  return new Promise((resolve) => {
    let left = pending.length
    const done = () => {
      left -= 1
      if (left <= 0) resolve()
    }
    pending.forEach((img) => {
      img.addEventListener('load', done, { once: true })
      img.addEventListener('error', done, { once: true })
    })
    setTimeout(resolve, timeoutMs)
  })
}

const PX_TO_MM = 25.4 / 96

/**
 * Impression d'un ticket : navigateur (boîte d'impression, page au format du
 * rouleau) ou imprimante Bluetooth ESC/POS. Rendre `portal` dans l'écran.
 */
export function useTicketPrinter() {
  const company = useTicketCompany()
  const { settings, setSettings } = usePrintSettings()
  const [job, setJob] = useState<{ data: TicketData; width: PaperWidth; showLogo: boolean; id: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const pageStyleRef = useRef<HTMLStyleElement>(null)
  const [btBusy, setBtBusy] = useState(false)

  const complete = useCallback(
    (input: TicketInput): TicketData => {
      const { vatEnabled, ...header } = company
      return {
        ...input,
        company: input.company ?? header,
        // Sans décomposition TVA fournie : mention selon le régime de l'entreprise
        vatMention:
          input.vatMention !== undefined || input.vat
            ? input.vatMention
            : vatEnabled === false
              ? VAT_NOT_APPLICABLE
              : vatEnabled
                ? 'Prix TTC, TVA comprise'
                : null,
        footer: input.footer ?? settings.footer,
      }
    },
    [company, settings.footer]
  )

  const printBrowser = useCallback(
    (input: TicketInput, override?: Partial<PrintSettings>) => {
      const s = { ...settings, ...override }
      setJob({ data: complete(input), width: s.paperWidth, showLogo: s.showLogo, id: Date.now() })
    },
    [complete, settings]
  )

  // Une fois le ticket rendu hors écran : hauteur mesurée → @page au format exact du ticket
  useEffect(() => {
    if (!job) return
    let cancelled = false
    const root = rootRef.current
    if (!root) return
    void waitForImages(root).then(() => {
      if (cancelled) return
      const heightMm = Math.ceil(root.getBoundingClientRect().height * PX_TO_MM) + 4
      if (pageStyleRef.current) {
        pageStyleRef.current.textContent = `@media print{@page{size:${job.width}mm ${Math.max(heightMm, 40)}mm;margin:0}}`
      }
      const cleanup = () => {
        window.removeEventListener('afterprint', cleanup)
        setJob((j) => (j?.id === job.id ? null : j))
      }
      window.addEventListener('afterprint', cleanup)
      window.print()
    })
    return () => {
      cancelled = true
    }
  }, [job])

  const printBluetooth = useCallback(
    async (input: TicketInput, override?: Partial<PrintSettings>) => {
      const s = { ...settings, ...override }
      setBtBusy(true)
      try {
        await printBytes(encodeTicketEscPos(complete(input), s.paperWidth))
        toast.success('Ticket envoyé à l’imprimante Bluetooth')
        return true
      } catch (e) {
        toast.error('Impression Bluetooth impossible', {
          description: `${e instanceof Error ? e.message : ''} Utilisez « Imprimer » (impression du navigateur).`.trim(),
        })
        return false
      } finally {
        setBtBusy(false)
      }
    },
    [complete, settings]
  )

  const portal =
    job && typeof document !== 'undefined'
      ? createPortal(
          <div ref={rootRef} className="bst-print-root" aria-hidden="true">
            <style>{`
.bst-print-root{position:fixed;left:-10000px;top:0;background:#fff}
@media print{
  html,body{background:#fff!important;margin:0!important;padding:0!important}
  body>*:not(.bst-print-root){display:none!important}
  .bst-print-root{position:static!important;left:auto!important}
}`}</style>
            <style ref={pageStyleRef} />
            <ThermalTicket data={job.data} width={job.width} showLogo={job.showLogo} />
          </div>,
          document.body
        )
      : null

  return { printBrowser, printBluetooth, btBusy, settings, setSettings, complete, portal }
}

/** Boîte « Imprimer le ticket » : aperçu, largeur 58/80 mm, mention, Bluetooth. */
export function TicketPrintDialog({
  open,
  onOpenChange,
  ticket,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ticket: TicketInput | null
}) {
  const printer = useTicketPrinter()
  const { settings, setSettings } = printer
  const [btSupported, setBtSupported] = useState(false)
  useEffect(() => setBtSupported(isBluetoothPrintingSupported()), [])

  const data = ticket ? printer.complete(ticket) : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Imprimer le ticket</DialogTitle>
            <DialogDescription>Imprimante thermique ou impression classique (PDF, A4).</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label id="paper-width-label">Largeur du rouleau</Label>
                <div role="radiogroup" aria-labelledby="paper-width-label" className="grid grid-cols-2 gap-2">
                  {PAPER_WIDTHS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      role="radio"
                      aria-checked={settings.paperWidth === w}
                      onClick={() => setSettings({ paperWidth: w })}
                      className={cn(
                        'h-11 rounded-lg border text-sm font-semibold transition-colors',
                        settings.paperWidth === w
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {w} mm
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Réglage mémorisé sur cet appareil.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-footer">Mention de bas de ticket</Label>
                <Input
                  id="ticket-footer"
                  value={settings.footer}
                  maxLength={200}
                  onChange={(e) => setSettings({ footer: e.target.value })}
                  placeholder="Merci de votre visite !"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="ticket-logo" className="font-normal">
                  Imprimer le logo
                </Label>
                <Switch id="ticket-logo" checked={settings.showLogo} onCheckedChange={(v) => setSettings({ showLogo: v })} />
              </div>
            </div>

            <div className="max-h-[50vh] overflow-auto rounded-lg border border-border bg-muted/60 p-3 sm:max-h-[420px]">
              {data && (
                <div className="mx-auto w-fit shadow-sm">
                  <ThermalTicket data={data} width={settings.paperWidth} showLogo={settings.showLogo} />
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            {btSupported && (
              <Button
                variant="outline"
                disabled={!ticket || printer.btBusy}
                onClick={() => ticket && void printer.printBluetooth(ticket)}
              >
                {printer.btBusy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Bluetooth aria-hidden="true" />}
                Imprimante Bluetooth
              </Button>
            )}
            <Button variant="brand" disabled={!ticket} onClick={() => ticket && printer.printBrowser(ticket)}>
              <Printer aria-hidden="true" /> Imprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {printer.portal}
    </>
  )
}

/** Bouton « Ticket » ouvrant la boîte d'impression. */
export function PrintTicketButton({
  ticket,
  label = 'Ticket',
  variant = 'outline',
  ...buttonProps
}: Omit<ComponentProps<typeof Button>, 'onClick' | 'children'> & { ticket: TicketInput | null; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant={variant} disabled={!ticket} {...buttonProps} onClick={() => setOpen(true)}>
        <Printer aria-hidden="true" /> {label}
      </Button>
      <TicketPrintDialog open={open} onOpenChange={setOpen} ticket={ticket} />
    </>
  )
}
