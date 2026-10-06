'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { ClientPickerDialog, PaidDialog, ReasonDialog, RenameDialog, TablePickerDialog, TablesSetupDialog } from './dialogs'
import { Receipt } from './receipt'
import { orderTitle, variantLabel, type PaidTicket, type PosOrder, type PosOrderItem, type PosState, type PosTable } from './types'

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
  const [printTicket, setPrintTicket] = useState<PaidTicket | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [online, setOnline] = useState(true)

  // Dépôt mémorisé par appareil ; ticket ouvert repris après un rafraîchissement
  useEffect(() => {
    setDepotId(localStorage.getItem(DEPOT_KEY))
    const ticket = new URLSearchParams(window.location.search).get('ticket')
    if (ticket) setOrderId(ticket)
    const tick = setInterval(() => setNow(Date.now()), 30_000)
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      clearInterval(tick)
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
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
  })
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
      toastError(e, 'Ajout impossible')
      void mutateState()
    } finally {
      setPendingVariantId(null)
    }
  }

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
    setPrintTicket(ticket)
    setTimeout(() => window.print(), 50)
  }

  function finishPaid() {
    setPaidTicket(null)
    setOrderId(null)
  }

  // Raccourcis : F9 encaisser, Échap retour à la salle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (dialog.type !== 'none' || paidTicket) return
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
          {!online && (
            <span className="flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning-foreground">
              <WifiOff className="h-3.5 w-3.5" aria-hidden="true" /> Hors ligne
            </span>
          )}
          {online && state && (
            <Wifi className="hidden h-4 w-4 text-success sm:block" aria-label="Connecté" />
          )}
          {state && state.depots.length > 1 && (
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
          {state?.canManage && (
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

      <main className="min-h-0 flex-1">
        {stateError && !state ? (
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
            onOpenOrder={(id) => setOrderId(id)}
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

      <PaidDialog ticket={paidTicket} onPrint={() => paidTicket && printReceipt(paidTicket)} onClose={finishPaid} />

      {printTicket &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="pos-print-root hidden">
            <Receipt ticket={printTicket} companyName={me?.companyName ?? 'B-Stock'} />
          </div>,
          document.body
        )}
    </div>
  )
}
