'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Loader2,
  Minus,
  MoreHorizontal,
  PauseCircle,
  Plus,
  Search,
  ShoppingBasket,
  UserRound,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/use-media-query'
import { formatMoney } from '@/lib/format'
import { ScanButton, type ScanHandler } from '@/components/scan/barcode-scanner'
import { orderTitle, variantLabel, type PosCatalogItem, type PosOrder, type PosOrderItem } from './types'

const MULTIPLIERS = [1, 2, 3, 6, 12, 24]

export function PosOrderView({
  order,
  catalog,
  pendingVariantId,
  onBack,
  onAdd,
  onScan,
  onReduce,
  onCheckout,
  onTransfer,
  onRename,
  onAttachClient,
  onCancelOrder,
}: {
  order: PosOrder
  catalog: PosCatalogItem[]
  pendingVariantId: string | null
  onBack: () => void
  onAdd: (variantId: string, quantity: number) => void
  /** Scan caméra : ajoute l'article scanné au ticket. */
  onScan?: ScanHandler
  onReduce: (item: PosOrderItem, newQuantity: number) => void
  onCheckout: () => void
  onTransfer: () => void
  onRename: () => void
  onAttachClient: () => void
  onCancelOrder: () => void
}) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [multiplier, setMultiplier] = useState(1)
  const [mobileTab, setMobileTab] = useState<'products' | 'ticket'>('products')
  const searchRef = useRef<HTMLInputElement>(null)
  const isWide = useMediaQuery('(min-width: 1024px)')

  // Raccourci clavier : « / » ou F2 → recherche produit
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT'
      if (e.key === 'F2' || (e.key === '/' && !typing)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const categories = useMemo(
    () => [...new Set(catalog.map((c) => c.category).filter((c): c is string => Boolean(c)))],
    [catalog]
  )
  const inTicket = useMemo(() => {
    const map = new Map<string, number>()
    for (const i of order.items) if (i.status === 'active') map.set(i.product_variant_id, (map.get(i.product_variant_id) ?? 0) + i.quantity)
    return map
  }, [order.items])

  const products = useMemo(() => {
    const q = search.trim().toLowerCase()
    return catalog.filter(
      (c) =>
        (!category || c.category === category) &&
        (!q || c.product_name.toLowerCase().includes(q) || c.brand?.toLowerCase().includes(q))
    )
  }, [catalog, category, search])

  const activeItems = order.items.filter((i) => i.status === 'active')
  const voidItems = order.items.filter((i) => i.status === 'void')
  const articleCount = activeItems.reduce((s, i) => s + i.quantity, 0)

  function add(item: PosCatalogItem) {
    onAdd(item.variant_id, multiplier)
    setMultiplier(1)
  }

  const ticketPanel = (
    <aside className="flex h-full min-h-0 flex-col bg-card">
      {/* En-tête du ticket */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Retour à la salle" className="-ml-2">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight text-foreground">{orderTitle(order)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {order.ticket_number}
            {order.client_name ? ` · ${order.client_name}` : order.label && order.table_name ? ` · ${order.label}` : ''}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Options du ticket">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={onAttachClient}>
              <UserRound /> {order.client_id ? 'Changer de client' : 'Rattacher un client (ardoise)'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTransfer}>Changer de table</DropdownMenuItem>
            <DropdownMenuItem onClick={onRename}>Nommer le ticket</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCancelOrder} className="text-destructive focus:text-destructive">
              <X /> Annuler le ticket
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Lignes */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <ShoppingBasket className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Ticket vide</p>
            <p className="text-sm text-muted-foreground">Touchez un produit pour l’ajouter.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {activeItems.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{variantLabel(item)}</p>
                  <p className="tabular text-xs text-muted-foreground">{formatMoney(item.unit_price)} l’unité</p>
                </div>
                <div className="flex items-center rounded-full border border-border">
                  <button
                    onClick={() => onReduce(item, item.quantity - 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label={`Retirer un ${item.product_name}`}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="tabular w-7 text-center text-sm font-semibold">{item.quantity}</span>
                  <button
                    onClick={() => onAdd(item.product_variant_id, 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label={`Ajouter un ${item.product_name}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="tabular w-24 text-right text-sm font-semibold text-foreground">
                  {formatMoney(item.quantity * item.unit_price)}
                </span>
              </li>
            ))}
            {voidItems.length > 0 && (
              <li className="px-4 py-3">
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">
                    {voidItems.length} article{voidItems.length > 1 ? 's' : ''} retiré{voidItems.length > 1 ? 's' : ''}
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {voidItems.map((v) => (
                      <li key={v.id} className="flex justify-between gap-2 line-through decoration-muted-foreground/50">
                        <span className="truncate">
                          {v.quantity} × {variantLabel(v)} — {v.void_reason}
                        </span>
                        <span className="tabular">{formatMoney(v.quantity * v.unit_price)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Total + actions */}
      <div className="space-y-3 border-t border-border p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">
            Total · {articleCount} article{articleCount > 1 ? 's' : ''}
          </span>
          <span className="tabular text-3xl font-semibold tracking-tight text-foreground">{formatMoney(order.total)}</span>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button variant="outline" size="xl" onClick={onBack} aria-label="Mettre en attente et revenir à la salle">
            <PauseCircle aria-hidden="true" />
            <span className="hidden sm:inline">En attente</span>
          </Button>
          <Button variant="brand" size="xl" onClick={onCheckout} disabled={activeItems.length === 0}>
            Encaisser <kbd className="ml-1 hidden rounded border border-brand-foreground/20 px-1.5 text-xs font-medium lg:inline">F9</kbd>
          </Button>
        </div>
      </div>
    </aside>
  )

  const productPanel = (
    <section className="h-full min-h-0 overflow-y-auto" aria-label="Produits">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un produit  ( / )"
              className="h-11 bg-card pl-9 text-base"
              aria-label="Rechercher un produit"
            />
          </div>
          {onScan && (
            <ScanButton
              iconOnly
              size="icon-lg"
              className="h-11 w-11 shrink-0"
              label="Scanner un article"
              title="Scanner des articles"
              description="Chaque article scanné est ajouté au ticket."
              continuous
              onDetected={onScan}
            />
          )}
          <div className="hidden items-center gap-1 rounded-lg border border-border bg-card p-1 sm:flex" role="radiogroup" aria-label="Quantité à ajouter">
            {MULTIPLIERS.map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={multiplier === m}
                onClick={() => setMultiplier(m)}
                className={cn(
                  'tabular h-9 min-w-9 rounded-md px-2 text-sm font-semibold transition-colors',
                  multiplier === m ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                ×{m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 pt-3">
        {/* Petits écrans : multiplicateur sur sa propre ligne défilante */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 sm:hidden" role="radiogroup" aria-label="Quantité à ajouter">
          {MULTIPLIERS.map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={multiplier === m}
              onClick={() => setMultiplier(m)}
              className={cn(
                'tabular h-9 min-w-11 shrink-0 rounded-full border px-3 text-sm font-semibold transition-colors',
                multiplier === m ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-muted-foreground'
              )}
            >
              ×{m}
            </button>
          ))}
        </div>
        {categories.length > 0 && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {[null, ...categories].map((c) => (
              <button
                key={c ?? 'all'}
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={cn(
                  'h-9 shrink-0 rounded-full border px-4 text-sm font-medium capitalize transition-colors',
                  category === c
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                )}
              >
                {c ?? 'Tout'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-4">
        {products.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {catalog.length === 0 ? 'Aucun produit au catalogue.' : 'Aucun produit ne correspond.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {products.map((item) => {
              // Bouteilles épuisées mais casier disponible : vendable (ouverture du casier)
              const fromPack = item.available <= 0 && item.openable > 0
              const out = item.available <= 0 && !fromPack
              const qty = inTicket.get(item.variant_id) ?? 0
              const pending = pendingVariantId === item.variant_id
              return (
                <button
                  key={item.variant_id}
                  onClick={() => add(item)}
                  disabled={out || pending}
                  aria-label={`${variantLabel(item)}, ${formatMoney(item.price)}, ${out ? 'rupture' : fromPack ? 'casier à ouvrir' : `${item.available} disponibles`}`}
                  className={cn(
                    'relative flex min-h-28 flex-col justify-between rounded-xl border bg-card p-3.5 text-left transition-[transform,box-shadow,border-color] duration-150',
                    out
                      ? 'cursor-not-allowed border-dashed border-border opacity-55'
                      : 'border-border hover:border-foreground/30 hover:shadow-sm active:scale-[0.97]',
                    qty > 0 && 'border-brand ring-1 ring-brand'
                  )}
                >
                  {qty > 0 && (
                    <span className="tabular absolute -right-2 -top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-brand-foreground shadow-sm">
                      {qty}
                    </span>
                  )}
                  <span className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{variantLabel(item)}</span>
                  <span className="mt-2 flex items-end justify-between gap-2">
                    <span className="tabular text-base font-semibold text-foreground">{formatMoney(item.price)}</span>
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <span
                        className={cn(
                          'tabular text-xs font-medium',
                          out ? 'text-destructive' : item.available <= 5 ? 'text-brand-strong' : 'text-muted-foreground'
                        )}
                      >
                        {out ? 'Rupture' : fromPack ? 'Casier à ouvrir' : `${item.available} dispo`}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )

  if (isWide) {
    // Écran large : produits | ticket côte à côte
    return (
      <div className="grid h-full min-h-0 grid-cols-[1fr_400px] xl:grid-cols-[1fr_440px]">
        <div className="min-h-0 border-r border-border">{productPanel}</div>
        {ticketPanel}
      </div>
    )
  }

  return (
    <>
      {/* Téléphone / tablette portrait : onglets + barre d'encaissement */}
      <div className="flex h-full min-h-0 flex-col">
        <div className="grid grid-cols-2 border-b border-border bg-card" role="tablist">
          {(['products', 'ticket'] as const).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={mobileTab === tab}
              onClick={() => setMobileTab(tab)}
              className={cn(
                'h-12 border-b-2 text-sm font-semibold transition-colors',
                mobileTab === tab ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground'
              )}
            >
              {tab === 'products' ? 'Produits' : `Ticket (${articleCount})`}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1">{mobileTab === 'products' ? productPanel : ticketPanel}</div>
        {mobileTab === 'products' && (
          <div className="flex items-center gap-3 border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button onClick={() => setMobileTab('ticket')} className="min-w-0 flex-1 text-left">
              <p className="truncate text-xs text-muted-foreground">
                {orderTitle(order)} · {articleCount} art.
              </p>
              <p className="tabular text-xl font-semibold text-foreground">{formatMoney(order.total)}</p>
            </button>
            <Button variant="brand" size="xl" onClick={onCheckout} disabled={activeItems.length === 0}>
              Encaisser
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
