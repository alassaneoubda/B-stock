'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { LayoutGrid, LogOut, Settings2, Wifi, WifiOff } from 'lucide-react'
import { BrandMonogram } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ErrorState } from '@/components/states'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError, apiFetch, toastError, toastWarnings } from '@/lib/api-client'
import { PosFloor } from './floor'
import { PosOrderView } from './order-view'
import { PaymentDialog, type PaymentMethod } from './payment-dialog'
import { ClientPickerDialog, PaidDialog, ReasonDialog, RenameDialog, TablePickerDialog, TablesSetupDialog, UnpackDialog, type UnpackProposal } from './dialogs'
import { useTicketPrinter } from '@/components/print/ticket-printer'
import { posTicketToTicket } from '@/components/print/pos-ticket'
import { isBluetoothPrintingSupported } from '@/lib/print/bluetooth'
import { useScannerInput } from '@/components/scan/use-scanner-input'
import { matchLabel, useBarcodeLookup } from '@/components/scan/use-barcode-lookup'
import { scanFeedback } from '@/components/scan/feedback'
import type { ScanOutcome } from '@/components/scan/barcode-scanner'
import { orderTitle, variantLabel, type PaidTicket, type PosOrder, type PosOrderItem, type PosState, type PosTable } from './types'
import { OfflineRegister } from '@/components/offline/offline-register'
import { OfflineReviewDialog, OfflineStatusBar } from '@/components/offline/offline-status'
import { useOfflineSales } from '@/components/offline/use-offline-sales'
import { isNetworkError, reportNetworkFailure, reportNetworkSuccess } from '@/lib/offline/network'
import { ownerKey } from '@/lib/offline/queue'
import { claimOwner, loadPosSnapshot, savePosSnapshot, type PosSnapshot } from '@/lib/offline/store'

const CORRECTION_WINDOW_MS = 5 * 60 * 1000
const DEPOT_KEY = 'bstock.pos.depot'

const fetcher = (url: string) => apiFetch<{ data: any }>(url).then((r) => r.data)

type Dialog =
  | { type: 'none' }
  | { type: 'pay' }
  | { type: 'void'; item: PosOrderItem; newQuantity: number }
  | { type: 'cancel' }
  | { type: 'transfer' }
  | { type: 'rename' }
  | { type: 'client' }
  | { type: 'tables' }
  | { type: 'unpack'; proposal: UnpackProposal; quantity: number }

export function PosApp() {
  const { data: session } = useSession()
  const me = session?.user
  const [depotId, setDepotId] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>({ type: 'none' })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pendingVariantId, setPendingVariantId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [paidTicket, setPaidTicket] = useState<PaidTicket | null>(null)
  const printer = useTicketPrinter()
  const [btPrint, setBtPrint] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // Vente hors ligne : file locale des ventes, catalogue mis en cache sur l'appareil
  const owner = ownerKey(me)
  const offlineSales = useOfflineSales(owner)
  const offline = offlineSales.offline
  const [reviewOpen, setReviewOpen] = useState(false)
  const [cachedSnapshot, setCachedSnapshot] = useState<PosSnapshot | null>(null)
  const [stateSavedAt, setStateSavedAt] = useState(() => new Date().toISOString())

  // Dépôt mémorisé par appareil ; ticket ouvert repris après un rafraîchissement
  useEffect(() => {
    setBtPrint(isBluetoothPrintingSupported())
    setDepotId(localStorage.getItem(DEPOT_KEY))
    const ticket = new URLSearchParams(window.location.search).get('ticket')
    if (ticket) setOrderId(ticket)
    const tick = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (orderId) url.searchParams.set('ticket', orderId)
    else url.searchParams.delete('ticket')
    window.history.replaceState(null, '', url)
  }, [orderId])

  // Salle + catalogue, rafraîchis régulièrement (plusieurs serveurs en parallèle)
  const stateKey = `/api/pos${depotId ? `?depotId=${depotId}` : ''}`
  const { data: state, error: stateError, mutate: mutateState } = useSWR<PosState>(stateKey, fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
    onSuccess: () => reportNetworkSuccess(),
    onError: (e) => {
      if (isNetworkError(e)) reportNetworkFailure()
    },
  })

  // Catalogue, tables et dépôts gardés sur l'appareil à chaque chargement en ligne (vente hors ligne)
  useEffect(() => {
    if (!state || !owner) return
    setStateSavedAt(new Date().toISOString())
    void claimOwner(owner, { userName: me?.name, companyName: me?.companyName })
      .then(() => savePosSnapshot(owner, { depotId: state.depotId, depots: state.depots, tables: state.tables, catalog: state.catalog }))
      .catch(() => {})
  }, [state, owner, me?.name, me?.companyName])

  // Hors ligne dès l'ouverture (rien en mémoire) : catalogue de l'appareil
  useEffect(() => {
    if (!offline || state || !owner) return
    void loadPosSnapshot(owner, depotId).then(setCachedSnapshot).catch(() => {})
  }, [offline, state, owner, depotId])

  const offlineSnapshot: PosSnapshot | null = state
    ? { savedAt: stateSavedAt, depotId: state.depotId, depots: state.depots, tables: state.tables, catalog: state.catalog }
    : cachedSnapshot
  const { data: order, mutate: mutateOrder } = useSWR<PosOrder>(orderId ? `/api/pos/orders/${orderId}` : null, fetcher, {
    refreshInterval: 10_000,
    onError: (e) => {
      if (e instanceof ApiError && e.status === 404) setOrderId(null)
    },
  })

  useEffect(() => {
    if (state?.depotId && state.depotId !== depotId) setDepotId(state.depotId)
  }, [state?.depotId, depotId])

  // Ticket clos ailleurs (autre appareil) : retour à la salle
  useEffect(() => {
    if (order && order.status !== 'open' && !paidTicket) {
      toast.info(`Le ticket ${order.ticket_number} a été ${order.status === 'paid' ? 'encaissé' : 'annulé'} sur un autre appareil`)
      setOrderId(null)
    }
  }, [order, paidTicket])

  const refreshAll = useCallback(() => {
    void mutateState()
    if (orderId) void mutateOrder()
  }, [mutateState, mutateOrder, orderId])

  // ----- Actions -----

  async function openOrder(body: Record<string, unknown>, key: string) {
    if (!state) return
    setBusyId(key)
    try {
      const res = await apiFetch<{ data: { id: string } }>('/api/pos/orders', {
        method: 'POST',
        body: { depotId: state.depotId, ...body },
      })
      setOrderId(res.data.id)
      void mutateState()
    } catch (e) {
      toastError(e)
    } finally {
      setBusyId(null)
    }
  }

  async function addItem(variantId: string, quantity: number) {
    if (!orderId || pendingVariantId) return
    setPendingVariantId(variantId)
    try {
      const res = await apiFetch<{ data: PosOrder }>(`/api/pos/orders/${orderId}/items`, {
        method: 'POST',
        body: { items: [{ variantId, quantity }] },
      })
      void mutateOrder(res.data, { revalidate: false })
      void mutateState()
    } catch (e) {
      // Plus assez de bouteilles mais un casier peut être ouvert : on demande confirmation
      if (e instanceof ApiError && e.code === 'UNPACK_REQUIRED' && e.details) {
        setDialog({ type: 'unpack', proposal: e.details as UnpackProposal, quantity })
      } else {
        toastError(e, 'Ajout impossible')
      }
      void mutateState()
    } finally {
      setPendingVariantId(null)
    }
  }

  /** Ouverture de casier confirmée : ajout avec ouverture (et réglage automatique si demandé). */
  async function confirmUnpack(alwaysAuto: boolean) {
    if (!orderId || dialog.type !== 'unpack') return
    const { proposal, quantity } = dialog
    setSubmitting(true)
    try {
      if (alwaysAuto) {
        await apiFetch('/api/pos/settings', { method: 'PATCH', body: { autoUnpack: true } })
      }
      const res = await apiFetch<{ data: PosOrder }>(`/api/pos/orders/${orderId}/items`, {
        method: 'POST',
        body: { items: [{ variantId: proposal.variantId, quantity }], unpack: true },
      })
      void mutateOrder(res.data, { revalidate: false })
      toast.success(`${proposal.packs} × ${proposal.packLabel} ouvert${proposal.packs > 1 ? 's' : ''}`)
      setDialog({ type: 'none' })
    } catch (e) {
      toastError(e, 'Ouverture impossible')
    } finally {
      setSubmitting(false)
      void mutateState()
    }
  }

  // ----- Scan de codes-barres : ajout au ticket ouvert -----
  // Les scans rapides (lecteur USB) sont mis en file : aucun article n'est perdu
  const scanQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const { lookup: lookupBarcode, dialog: barcodeDialog } = useBarcodeLookup({
    depotId: state?.depotId,
    onAssigned: (match) => void scanToTicket(match.barcode).then(reportScan),
  })

  function scanToTicket(code: string): Promise<Exclude<ScanOutcome, void>> {
    const run = async (): Promise<Exclude<ScanOutcome, void>> => {
      if (!orderId) return { ok: false, message: 'Ouvrez d’abord un ticket (table ou comptoir).' }
      const result = await lookupBarcode(code)
      if (result.status === 'unknown') return { ok: false, message: 'Code-barres inconnu', close: true }
      if (result.status === 'error') return { ok: false, message: result.message }
      const label = matchLabel(result.match)
      const item = state?.catalog.find((c) => c.variant_id === result.match.variant_id)
      if (!item) return { ok: false, message: `${label} : non disponible dans ce dépôt` }
      if (item.available <= 0 && !(item.openable > 0)) return { ok: false, message: `${label} : rupture de stock` }
      try {
        const res = await apiFetch<{ data: PosOrder }>(`/api/pos/orders/${orderId}/items`, {
          method: 'POST',
          body: { items: [{ variantId: item.variant_id, quantity: 1 }] },
        })
        void mutateOrder(res.data, { revalidate: false })
        void mutateState()
        return { ok: true, message: `Ajouté : ${label}` }
      } catch (e) {
        void mutateState()
        if (e instanceof ApiError && e.code === 'UNPACK_REQUIRED' && e.details) {
          setDialog({ type: 'unpack', proposal: e.details as UnpackProposal, quantity: 1 })
          return { ok: false, message: 'Ouverture de casier à confirmer', close: true }
        }
        return { ok: false, message: e instanceof Error ? e.message : 'Ajout impossible' }
      }
    }
    const next = scanQueueRef.current.then(run, run)
    scanQueueRef.current = next.catch(() => {})
    return next
  }

  function reportScan(outcome: Exclude<ScanOutcome, void>) {
    scanFeedback(outcome.ok)
    if (outcome.ok) toast.success(outcome.message, { duration: 1500 })
    else if (!outcome.close) toast.error(outcome.message)
  }

  useScannerInput((code) => void scanToTicket(code).then(reportScan), {
    enabled: Boolean(orderId && order?.status === 'open') && dialog.type === 'none' && !paidTicket && !offline,
  })

  async function reduceItem(item: PosOrderItem, newQuantity: number, reason?: string) {
    if (!orderId) return
    const quick = item.added_by === me?.id && now - new Date(item.created_at).getTime() < CORRECTION_WINDOW_MS
    if (!quick && reason === undefined) {
      if (!state?.canManage) {
        toast.error('Article déjà servi', { description: 'Seul un gérant peut le retirer du ticket.' })
        return
      }
      setDialog({ type: 'void', item, newQuantity })
      return
    }
    setSubmitting(true)
    try {
      const res = await apiFetch<{ data: PosOrder; voided: boolean }>(`/api/pos/orders/${orderId}/items/${item.id}`, {
        method: 'PATCH',
        body: { quantity: newQuantity, reason: reason ?? null },
      })
      void mutateOrder(res.data, { revalidate: false })
      void mutateState()
      if (res.voided) toast.success('Article retiré du ticket (tracé)')
      setDialog({ type: 'none' })
    } catch (e) {
      toastError(e)
    } finally {
      setSubmitting(false)
    }
  }

  async function updateOrder(body: Record<string, unknown>, success: string) {
    if (!orderId) return
    setSubmitting(true)
    try {
      const res = await apiFetch<{ data: PosOrder }>(`/api/pos/orders/${orderId}`, { method: 'PATCH', body })
      void mutateOrder(res.data, { revalidate: false })
      void mutateState()
      toast.success(success)
      setDialog({ type: 'none' })
    } catch (e) {
      toastError(e)
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelOrder(reason: string) {
    if (!orderId) return
    setSubmitting(true)
    try {
      await apiFetch(`/api/pos/orders/${orderId}/cancel`, { method: 'POST', body: { reason } })
      toast.success('Ticket annulé')
      setDialog({ type: 'none' })
      setOrderId(null)
      void mutateState()
    } catch (e) {
      toastError(e)
    } finally {
      setSubmitting(false)
    }
  }

  /** Retour à la salle : un ticket resté vide est fermé automatiquement. */
  async function backToFloor() {
    const current = order
    setOrderId(null)
    if (current && current.status === 'open' && !current.items.some((i) => i.status === 'active')) {
      await apiFetch(`/api/pos/orders/${current.id}/cancel`, { method: 'POST', body: { reason: '' } }).catch(() => {})
    } else if (current?.status === 'open') {
      toast.success(`${orderTitle(current)} mis en attente`)
    }
    void mutateState()
  }

  async function pay(input: { paymentMethod: PaymentMethod; paidAmount: number; cashAmount?: number; received: number }) {
    if (!order) return
    setSubmitting(true)
    try {
      const res = await apiFetch<{ data: { orderNumber: string }; warnings?: string[] }>(`/api/pos/orders/${order.id}/pay`, {
        method: 'POST',
        body: { paymentMethod: input.paymentMethod, paidAmount: input.paidAmount, cashAmount: input.cashAmount },
      })
      toastWarnings(res.warnings)
      setPaidTicket({
        ticketNumber: order.ticket_number,
        orderNumber: res.data.orderNumber,
        tableName: order.table_name,
        label: order.client_name ?? order.label,
        items: order.items
          .filter((i) => i.status === 'active')
          .map((i) => ({ name: variantLabel(i), quantity: i.quantity, unitPrice: i.unit_price })),
        total: order.total,
        paymentMethod: input.paymentMethod,
        received: input.received,
        change: input.paymentMethod === 'cash' ? Math.max(0, input.received - order.total) : 0,
        paidAt: new Date().toISOString(),
        cashierName: me?.name ?? '',
      })
      setDialog({ type: 'none' })
      void mutateState()
    } catch (e) {
      toastError(e, 'Encaissement impossible')
    } finally {
      setSubmitting(false)
    }
  }

  function printReceipt(ticket: PaidTicket) {
    printer.printBrowser(posTicketToTicket(ticket))
  }

  function finishPaid() {
    setPaidTicket(null)
    setOrderId(null)
  }

  // Raccourcis : F9 encaisser, Échap retour à la salle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (dialog.type !== 'none' || paidTicket || offline) return
      // Scanner caméra ou « Code inconnu » ouvert : Échap ferme la boîte, pas le ticket
      if (document.querySelector('[role="dialog"]')) return
      if (e.key === 'F9' && order && order.items.some((i) => i.status === 'active')) {
        e.preventDefault()
        setDialog({ type: 'pay' })
      } else if (e.key === 'Escape' && orderId) {
        e.preventDefault()
        void backToFloor()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ----- Rendu -----

  const close = () => setDialog({ type: 'none' })

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-3 sm:px-4">
        <BrandMonogram size={30} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-foreground">Point de vente</p>
          <p className="truncate text-xs text-muted-foreground">{me?.companyName}</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {offline && (
            <span className="flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning-foreground">
              <WifiOff className="h-3.5 w-3.5" aria-hidden="true" /> Hors ligne
            </span>
          )}
          {!offline && state && (
            <Wifi className="hidden h-4 w-4 text-success sm:block" aria-label="Connecté" />
          )}
          {state && state.depots.length > 1 && !offline && (
            <Select
              value={state.depotId}
              onValueChange={(value) => {
                localStorage.setItem(DEPOT_KEY, value)
                setDepotId(value)
                setOrderId(null)
              }}
            >
              <SelectTrigger className="h-9 w-[150px]" aria-label="Dépôt">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {state.depots.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {orderId && (
            <Button variant="ghost" size="sm" onClick={() => void backToFloor()} className="hidden sm:inline-flex">
              <LayoutGrid aria-hidden="true" /> Salle
            </Button>
          )}
          {state?.canManage && !offline && (
            <Button variant="ghost" size="icon" onClick={() => setDialog({ type: 'tables' })} aria-label="Ajouter des tables">
              <Settings2 />
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard">
              <LogOut aria-hidden="true" />
              <span className="hidden sm:inline">Quitter</span>
            </Link>
          </Button>
        </div>
      </header>

      <OfflineStatusBar state={offlineSales} onReview={() => setReviewOpen(true)} />

      <main className="min-h-0 flex-1">
        {offline && owner ? (
          offlineSnapshot ? (
            <OfflineRegister
              key={orderId && order?.status === 'open' ? order.id : 'counter'}
              owner={owner}
              snapshot={offlineSnapshot}
              sales={offlineSales}
              cashierName={me?.name ?? ''}
              ticket={orderId && order?.status === 'open' ? order : null}
              onLeaveTicket={() => setOrderId(null)}
              onPaid={setPaidTicket}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <ErrorState
                title="Hors ligne"
                description="Aucun catalogue n’est enregistré sur cet appareil. Ouvrez une fois le point de vente avec du réseau pour pouvoir vendre hors ligne."
                onRetry={refreshAll}
              />
            </div>
          )
        ) : stateError && !state ? (
          <div className="flex h-full items-center justify-center p-6">
            <ErrorState
              title="Point de vente indisponible"
              description={stateError instanceof Error ? stateError.message : 'Vérifiez votre connexion.'}
              onRetry={refreshAll}
            />
          </div>
        ) : !state ? (
          <div className="grid grid-cols-2 gap-3 p-6 sm:grid-cols-4 xl:grid-cols-6" aria-busy="true" aria-label="Chargement">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />
            ))}
          </div>
        ) : orderId && order ? (
          <PosOrderView
            order={order}
            catalog={state.catalog}
            pendingVariantId={pendingVariantId}
            onBack={() => void backToFloor()}
            onAdd={addItem}
            onScan={scanToTicket}
            onReduce={(item, q) => void reduceItem(item, q)}
            onCheckout={() => setDialog({ type: 'pay' })}
            onTransfer={() => setDialog({ type: 'transfer' })}
            onRename={() => setDialog({ type: 'rename' })}
            onAttachClient={() => setDialog({ type: 'client' })}
            onCancelOrder={() => setDialog({ type: 'cancel' })}
          />
        ) : orderId ? (
          <div className="grid h-full lg:grid-cols-[1fr_440px]" aria-busy="true">
            <Skeleton className="m-4 rounded-2xl" />
            <Skeleton className="m-4 rounded-2xl" />
          </div>
        ) : (
          <PosFloor
            tables={state.tables}
            openOrders={state.openOrders}
            now={now}
            busyId={busyId}
            canManage={state.canManage}
            onOpenTable={(table: PosTable) => void openOrder({ tableId: table.id }, table.id)}
            onOpenOrder={(id) => {
              // Ticket déjà encaissé hors ligne : on attend son envoi (pas de double encaissement)
              if (offlineSales.pending.some((s) => s.kind === 'pos' && 'posOrderId' in s.payload && s.payload.posOrderId === id)) {
                toast.info('Ce ticket a été encaissé hors ligne', { description: 'Il sera clos dès l’envoi de la vente (voir « Ventes hors ligne »).' })
                void offlineSales.syncNow(false)
                return
              }
              setOrderId(id)
            }}
            onNewCounter={() => void openOrder({ orderType: 'counter' }, 'counter')}
            onSetupTables={() => setDialog({ type: 'tables' })}
          />
        )}
      </main>

      {order && (
        <>
          <PaymentDialog
            open={dialog.type === 'pay'}
            total={order.total}
            hasClient={Boolean(order.client_id)}
            clientName={order.client_name}
            submitting={submitting}
            onOpenChange={(o) => !o && close()}
            onConfirm={(input) => void pay(input)}
          />
          <ReasonDialog
            open={dialog.type === 'void'}
            title="Retirer un article servi"
            description={
              dialog.type === 'void'
                ? `${dialog.item.product_name} : ${dialog.item.quantity} → ${dialog.newQuantity}. Le retrait est enregistré avec votre nom.`
                : ''
            }
            confirmLabel="Retirer"
            destructive
            submitting={submitting}
            onOpenChange={(o) => !o && close()}
            onConfirm={(reason) => dialog.type === 'void' && void reduceItem(dialog.item, dialog.newQuantity, reason)}
          />
          <ReasonDialog
            open={dialog.type === 'cancel'}
            title={`Annuler le ticket ${order.ticket_number} ?`}
            description={
              order.items.some((i) => i.status === 'active')
                ? 'Les articles seront retirés et le stock réservé libéré. Réservé au gérant, avec un motif.'
                : 'Ce ticket est vide.'
            }
            requireReason={order.items.some((i) => i.status === 'active')}
            confirmLabel="Annuler le ticket"
            destructive
            submitting={submitting}
            onOpenChange={(o) => !o && close()}
            onConfirm={(reason) => void cancelOrder(reason)}
          />
          <TablePickerDialog
            open={dialog.type === 'transfer'}
            tables={state?.tables ?? []}
            openOrders={state?.openOrders ?? []}
            currentTableId={order.table_id}
            submitting={submitting}
            onOpenChange={(o) => !o && close()}
            onPick={(tableId) => void updateOrder({ tableId }, tableId ? 'Ticket transféré' : 'Ticket passé au comptoir')}
          />
          <RenameDialog
            open={dialog.type === 'rename'}
            initial={order.label ?? ''}
            submitting={submitting}
            onOpenChange={(o) => !o && close()}
            onSave={(label) => void updateOrder({ label: label || null }, 'Ticket renommé')}
          />
          <ClientPickerDialog
            open={dialog.type === 'client'}
            submitting={submitting}
            onOpenChange={(o) => !o && close()}
            onPick={(clientId) => void updateOrder({ clientId }, clientId ? 'Client rattaché' : 'Client retiré')}
          />
          <UnpackDialog
            proposal={dialog.type === 'unpack' ? dialog.proposal : null}
            productLabel={(() => {
              if (dialog.type !== 'unpack') return ''
              const item = state?.catalog.find((c) => c.variant_id === dialog.proposal.variantId)
              return item ? variantLabel(item) : 'Ce produit'
            })()}
            canManage={Boolean(state?.canManage) && !state?.autoUnpack}
            submitting={submitting}
            onOpenChange={(o) => !o && close()}
            onConfirm={(alwaysAuto) => void confirmUnpack(alwaysAuto)}
          />
        </>
      )}

      <TablesSetupDialog
        open={dialog.type === 'tables'}
        onOpenChange={(o) => !o && close()}
        onCreated={() => {
          toast.success('Tables créées')
          void mutateState()
        }}
      />

      <PaidDialog
        ticket={paidTicket}
        onPrint={() => paidTicket && printReceipt(paidTicket)}
        onPrintBluetooth={btPrint ? () => paidTicket && void printer.printBluetooth(posTicketToTicket(paidTicket)) : undefined}
        printingBluetooth={printer.btBusy}
        onClose={finishPaid}
      />

      <OfflineReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} state={offlineSales} />

      {barcodeDialog}
      {printer.portal}
    </div>
  )
}
