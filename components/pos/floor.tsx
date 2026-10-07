'use client'

import { useMemo, useState } from 'react'
import { Clock, Plus, ShoppingBag, Store, Users, Utensils } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format'
import type { PosOpenOrder, PosTable } from './types'

function elapsed(from: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(from).getTime()) / 60000))
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  return `${h} h ${String(minutes % 60).padStart(2, '0')}`
}

export function PosFloor({
  tables,
  openOrders,
  now,
  busyId,
  canManage,
  onOpenTable,
  onOpenOrder,
  onNewCounter,
  onSetupTables,
}: {
  tables: PosTable[]
  openOrders: PosOpenOrder[]
  now: number
  busyId: string | null
  canManage: boolean
  onOpenTable: (table: PosTable) => void
  onOpenOrder: (orderId: string) => void
  onNewCounter: () => void
  onSetupTables: () => void
}) {
  const areas = useMemo(
    () => [...new Set(tables.map((t) => t.area).filter((a): a is string => Boolean(a)))],
    [tables]
  )
  const [area, setArea] = useState<string | null>(null)
  const orderByTable = useMemo(() => new Map(openOrders.filter((o) => o.table_id).map((o) => [o.table_id!, o])), [openOrders])
  const pending = openOrders.filter((o) => !o.table_id)
  const visibleTables = area ? tables.filter((t) => t.area === area) : tables
  const occupied = orderByTable.size
  const openTotal = openOrders.reduce((s, o) => s + o.total, 0)

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4 sm:p-6">
      {/* En-tête de service */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Salle</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {tables.length > 0 ? (
              <>
                <span className="tabular font-medium text-foreground">{occupied}</span> table{occupied > 1 ? 's' : ''} occupée
                {occupied > 1 ? 's' : ''} sur {tables.length} ·{' '}
              </>
            ) : null}
            En cours : <span className="tabular font-medium text-foreground">{formatMoney(openTotal)}</span>
          </p>
        </div>
        <Button variant="brand" size="xl" onClick={onNewCounter} disabled={busyId === 'counter'}>
          <ShoppingBag aria-hidden="true" />
          Vente comptoir
        </Button>
      </div>

      {/* Filtre par zone */}
      {areas.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Zones">
          {[null, ...areas].map((a) => (
            <button
              key={a ?? 'all'}
              role="tab"
              aria-selected={area === a}
              onClick={() => setArea(a)}
              className={cn(
                'h-9 rounded-full border px-4 text-sm font-medium transition-colors',
                area === a
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {a ?? 'Toutes'}
            </button>
          ))}
        </div>
      )}

      {/* Plan des tables */}
      {tables.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
            <Utensils className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="max-w-sm space-y-1">
            <p className="font-semibold text-foreground">Aucune table configurée</p>
            <p className="text-sm text-muted-foreground">
              {canManage
                ? 'Créez vos tables pour suivre les consommations de chaque groupe. La vente comptoir fonctionne déjà.'
                : 'Demandez au gérant de créer les tables. En attendant, utilisez la vente comptoir.'}
            </p>
          </div>
          {canManage && (
            <Button onClick={onSetupTables} className="mt-1">
              <Plus aria-hidden="true" /> Créer les tables
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {visibleTables.map((table) => {
            const order = orderByTable.get(table.id)
            const isBusy = busyId === table.id
            return (
              <button
                key={table.id}
                onClick={() => (order ? onOpenOrder(order.id) : onOpenTable(table))}
                disabled={isBusy}
                aria-label={
                  order
                    ? `${table.name}, occupée, ${formatMoney(order.total)}, depuis ${elapsed(order.opened_at, now)}`
                    : `${table.name}, libre`
                }
                className={cn(
                  'group relative flex min-h-28 flex-col justify-between rounded-2xl border p-4 text-left transition-[transform,box-shadow,border-color,background-color] duration-150 active:scale-[0.98] disabled:opacity-60',
                  order
                    ? 'border-transparent bg-foreground text-background shadow-md hover:shadow-lg'
                    : 'border-dashed border-foreground/15 bg-transparent text-foreground hover:border-foreground/40 hover:bg-card'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-lg font-semibold tracking-tight">{table.name}</span>
                  {order ? (
                    <span className="h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-brand/25" aria-hidden="true" />
                  ) : (
                    <span className="text-xs font-medium text-muted-foreground">Libre</span>
                  )}
                </div>
                {order ? (
                  <div className="space-y-1">
                    <p className="tabular text-xl font-semibold leading-none">{formatMoney(order.total)}</p>
                    <p className="flex items-center gap-1.5 text-xs text-background/70">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {elapsed(order.opened_at, now)}
                      <span aria-hidden="true">·</span>
                      {order.items_count} art.
                    </p>
                    {(order.label || order.client_name) && (
                      <p className="truncate text-xs text-background/70">{order.client_name ?? order.label}</p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {table.area && <span>{table.area}</span>}
                    {table.seats ? (
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" aria-hidden="true" />
                        {table.seats}
                      </span>
                    ) : null}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Commandes sans table (comptoir / à emporter) mises en attente */}
      <section aria-labelledby="pending-title" className="space-y-3">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 id="pending-title" className="text-sm font-semibold text-foreground">
            Commandes en attente
          </h2>
          {pending.length > 0 && (
            <span className="tabular rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-strong">
              {pending.length}
            </span>
          )}
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune. Une vente comptoir peut être mise en attente pour être complétée plus tard.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pending.map((order) => (
              <button
                key={order.id}
                onClick={() => onOpenOrder(order.id)}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-left transition-shadow hover:shadow-sm active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {order.client_name ?? order.label ?? (order.order_type === 'takeaway' ? 'À emporter' : 'Comptoir')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {order.ticket_number} · {elapsed(order.opened_at, now)} · {order.items_count} art.
                  </p>
                </div>
                <span className="tabular shrink-0 font-semibold text-foreground">{formatMoney(order.total)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
