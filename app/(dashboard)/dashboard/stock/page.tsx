'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageShell, StatCard, StatusBadge } from '@/components/app/blocks'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Search,
  Package,
  BoxesIcon,
  AlertTriangle,
  Warehouse,
  TrendingDown,
  Clock,
  Printer,
  CheckCircle2,
  PackageOpen,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { apiFetch } from '@/lib/api-client'
import { formatMoney, formatNumber } from '@/lib/format'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { toast } from 'sonner'
import { ScanButton, type ScanOutcome } from '@/components/scan/barcode-scanner'
import { useScannerInput } from '@/components/scan/use-scanner-input'
import { matchLabel, useBarcodeLookup, type BarcodeMatch } from '@/components/scan/use-barcode-lookup'
import { scanFeedback } from '@/components/scan/feedback'
import { UnpackHistory, UnpackStockDialog, type UnpackOption } from '@/components/stock/unpack'

interface ProductOption {
  id: string
  name: string
  category: string | null
}

interface StockItem {
  id: string
  quantity: number
  lot_number: string | null
  expiry_date: string | null
  min_stock_alert: number
  variant_id: string
  price: number
  cost_price: number | null
  /** Coût moyen pondéré du dépôt (repli : prix d'achat catalogue). */
  avg_cost: number
  /** Quantité × CMP. */
  stock_value: number
  /** Variante unité liée : ce conditionnement peut être ouvert. */
  unit_variant_id: string | null
  barcode: string | null
  product_id: string
  product_name: string
  category: string | null
  brand: string | null
  sku: string | null
  packaging_name: string | null
  units_per_case: number | null
  depot_name: string
  depot_id?: string
}

const ALL = 'all'

export default function StockPage() {
  const { data: session } = useSession()
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [packagingStock, setPackagingStock] = useState<Array<Record<string, unknown>>>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim(), 300)
  const [category, setCategory] = useState(ALL)
  const [productId, setProductId] = useState(ALL)
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [packagingError, setPackagingError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [activeTab, setActiveTab] = useState('products')
  const [unpackOpen, setUnpackOpen] = useState(false)
  const [unpackKey, setUnpackKey] = useState<string | null>(null)
  const companyId = session?.user?.companyId

  // Options des filtres (catégories / produits) et stock emballages : chargés une fois
  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    apiFetch<{ data: ProductOption[] }>('/api/products')
      .then((res) => {
        if (!cancelled) setProducts(res.data ?? [])
      })
      .catch(() => {
        // Filtres facultatifs : la liste du stock reste utilisable sans eux
      })
    setPackagingError(false)
    apiFetch<{ data: Array<Record<string, unknown>> }>('/api/packaging/stock')
      .then((res) => {
        if (!cancelled) setPackagingStock(res.data ?? [])
      })
      .catch(() => {
        if (!cancelled) setPackagingError(true)
      })
    return () => {
      cancelled = true
    }
  }, [companyId, reloadKey])

  // Stock produits : filtres appliqués côté serveur
  useEffect(() => {
    if (!companyId) return
    const controller = new AbortController()
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (category !== ALL) params.set('category', category)
    if (productId !== ALL) params.set('productId', productId)
    if (lowStockOnly) params.set('lowStock', 'true')

    setLoading(true)
    setLoadError(false)
    apiFetch<{ data: StockItem[] }>(`/api/stock?${params.toString()}`, { signal: controller.signal })
      .then((res) => {
        setStockItems(res.data ?? [])
        setLoading(false)
      })
      .catch((e) => {
        if ((e as Error)?.name === 'AbortError') return
        setLoadError(true)
        setLoading(false)
      })
    return () => controller.abort()
  }, [companyId, debouncedSearch, category, productId, lowStockOnly, reloadKey])

  const categories = Array.from(
    new Set(products.map((p) => p.category).filter((c): c is string => !!c))
  ).sort((a, b) => a.localeCompare(b, 'fr'))
  const productOptions = products.filter((p) => category === ALL || p.category === category)
  const hasFilters = !!debouncedSearch || category !== ALL || productId !== ALL || lowStockOnly
  const retry = () => setReloadKey((k) => k + 1)

  const totalProducts = stockItems.length
  const lowStockItems = stockItems.filter(
    (s) => s.quantity <= s.min_stock_alert
  )
  const expiringItems = stockItems.filter((s) => {
    if (!s.expiry_date) return false
    const daysUntilExpiry = Math.ceil(
      (new Date(s.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
    return daysUntilExpiry >= 0 && daysUntilExpiry <= 30
  })

  // Valeur au coût moyen pondéré (CMP) du dépôt, comme les rapports de valorisation
  const totalValue = stockItems.reduce((sum, s) => sum + Number(s.stock_value || 0), 0)

  // Conditionnements ouvrables (vente à la bouteille), agrégés par (variante, dépôt)
  const unpackOptions = Object.values(
    stockItems.reduce<Record<string, UnpackOption>>((acc, s) => {
      if (!s.unit_variant_id || !s.depot_id || Number(s.units_per_case ?? 1) <= 1) return acc
      const key = `${s.variant_id}:${s.depot_id}`
      acc[key] ??= {
        packVariantId: s.variant_id,
        depotId: s.depot_id,
        depotName: s.depot_name,
        label: `${s.product_name}${s.packaging_name ? ` — ${s.packaging_name}` : ''}`,
        available: 0,
        unitsPerPack: Number(s.units_per_case),
      }
      acc[key].available += Number(s.quantity)
      return acc
    }, {})
  ).filter((o) => o.available > 0)
  const openUnpack = (key: string | null = null) => {
    setUnpackKey(key)
    setUnpackOpen(true)
  }


  // ----- Scan : filtre le stock sur le produit scanné -----
  function showScanned(match: BarcodeMatch): Exclude<ScanOutcome, void> {
    setActiveTab((t) => (t === 'packaging' ? 'products' : t))
    setSearch('')
    setCategory(ALL)
    setLowStockOnly(false)
    setProductId(match.product_id)
    return { ok: true, message: `Stock de ${matchLabel(match)}` }
  }

  const { lookup: lookupBarcode, dialog: barcodeDialog } = useBarcodeLookup({
    onAssigned: (match) => void showScanned(match),
  })

  async function handleScan(code: string): Promise<Exclude<ScanOutcome, void>> {
    const result = await lookupBarcode(code)
    if (result.status === 'unknown') return { ok: false, message: 'Code-barres inconnu', close: true }
    if (result.status === 'error') return { ok: false, message: result.message }
    return showScanned(result.match)
  }

  useScannerInput(async (code) => {
    const outcome = await handleScan(code)
    scanFeedback(outcome.ok)
    if (outcome.ok) toast.success(outcome.message, { duration: 1500 })
    else if (!outcome.close) toast.error(outcome.message)
  })

  const resetFilters = () => {
    setSearch('')
    setCategory(ALL)
    setProductId(ALL)
    setLowStockOnly(false)
  }

  // Statut affiché (libellé + ton) : rupture, stock bas, expiration proche, OK
  const statusOf = (item: StockItem): { label: string; tone: 'danger' | 'warning' | 'success' } => {
    const isLow = item.quantity <= item.min_stock_alert
    const isExpiring = item.expiry_date && Math.ceil(
      (new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    ) <= 30
    if (item.quantity <= 0) return { label: 'Rupture', tone: 'danger' }
    if (isLow) return { label: 'Stock bas', tone: 'warning' }
    if (isExpiring) return { label: 'Expire bientôt', tone: 'warning' }
    return { label: 'OK', tone: 'success' }
  }

  const alertCount = lowStockItems.length + expiringItems.length

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title="Stock"
        description="Inventaire produits et emballages en temps réel"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => openUnpack()}
              disabled={unpackOptions.length === 0}
              aria-label="Ouvrir un casier"
              title={unpackOptions.length === 0 ? 'Aucun casier ouvrable en stock (activez la vente à la bouteille sur la fiche produit)' : undefined}
            >
              <PackageOpen className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Ouvrir un casier</span>
            </Button>
            <Button variant="outline" size="sm" asChild className="h-9">
              <Link href="/dashboard/stock/export" aria-label="Imprimer l'état du stock">
                <Printer className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">État du stock</span>
              </Link>
            </Button>
          </div>
        }
      />

      <PageShell>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Références en stock" value={formatNumber(totalProducts)} hint="Variantes produit" icon={Package} />
          <StatCard label="Valeur du stock" value={formatMoney(totalValue)} hint="Au coût moyen pondéré (CMP)" icon={Warehouse} tone="success" />
          <StatCard
            label="Stock bas"
            value={formatNumber(lowStockItems.length)}
            hint="Sous le seuil d'alerte"
            icon={TrendingDown}
            tone={lowStockItems.length > 0 ? 'danger' : 'default'}
          />
          <StatCard
            label="Expirations proches"
            value={formatNumber(expiringItems.length)}
            hint="Dans les 30 prochains jours"
            icon={Clock}
            tone={expiringItems.length > 0 ? 'warning' : 'default'}
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
          <div className="overflow-x-auto">
            <TabsList>
              <TabsTrigger value="products">
                <Package aria-hidden="true" />
                Produits
                <span className="tabular text-muted-foreground">{formatNumber(totalProducts)}</span>
              </TabsTrigger>
              <TabsTrigger value="packaging">
                <BoxesIcon aria-hidden="true" />
                Emballages
                <span className="tabular text-muted-foreground">{formatNumber(packagingStock.length)}</span>
              </TabsTrigger>
              <TabsTrigger value="alerts">
                <AlertTriangle aria-hidden="true" />
                Alertes
                <span className="tabular text-muted-foreground">{formatNumber(alertCount)}</span>
              </TabsTrigger>
              <TabsTrigger value="unpacks">
                <PackageOpen aria-hidden="true" />
                Casiers ouverts
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Barre d'outils (filtres du stock produits et des alertes) */}
          {activeTab !== 'packaging' && activeTab !== 'unpacks' && (
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex w-full gap-2 lg:max-w-sm">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    placeholder="Rechercher un produit…"
                    aria-label="Rechercher un produit"
                    className="h-10 pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <ScanButton
                  size="lg"
                  className="h-10 shrink-0"
                  title="Rechercher par code-barres"
                  description="Scannez un article pour afficher son stock."
                  onDetected={handleScan}
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Select
                  value={category}
                  onValueChange={(v) => {
                    setCategory(v)
                    setProductId(ALL)
                  }}
                >
                  <SelectTrigger className="h-10 w-full sm:w-48" aria-label="Filtrer par catégorie">
                    <SelectValue placeholder="Catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Toutes les catégories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger className="h-10 w-full sm:w-56" aria-label="Filtrer par produit">
                    <SelectValue placeholder="Produit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Tous les produits</SelectItem>
                    {productOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3">
                  <Switch id="low-stock-only" checked={lowStockOnly} onCheckedChange={setLowStockOnly} />
                  <Label htmlFor="low-stock-only" className="whitespace-nowrap text-sm font-normal text-foreground">
                    Stock bas uniquement
                  </Label>
                </div>
              </div>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="self-start lg:ml-auto lg:self-center" onClick={resetFilters}>
                  Réinitialiser
                </Button>
              )}
            </div>
          )}

          {/* Onglet produits */}
          <TabsContent value="products" className="mt-0">
            {loading ? (
              <div className="rounded-xl border border-border bg-card p-5">
                <TableSkeleton rows={6} columns={6} />
              </div>
            ) : loadError ? (
              <ErrorState description="Le stock n'a pas pu être chargé." onRetry={retry} />
            ) : stockItems.length === 0 ? (
              hasFilters ? (
                <EmptyState
                  icon={Package}
                  title="Aucun résultat"
                  description="Aucune ligne de stock ne correspond à ces filtres."
                  action={{ label: 'Réinitialiser les filtres', onClick: resetFilters }}
                />
              ) : (
                <EmptyState
                  icon={Package}
                  title="Aucun stock"
                  description="Commencez par créer des produits et faire un approvisionnement."
                  action={{ label: 'Nouvel approvisionnement', href: '/dashboard/procurement/new' }}
                />
              )
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
                {/* Tableau (desktop) */}
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-5">Produit</TableHead>
                        <TableHead>Format</TableHead>
                        <TableHead>Dépôt</TableHead>
                        <TableHead className="text-right">Quantité</TableHead>
                        <TableHead className="text-right">Coût moyen</TableHead>
                        <TableHead className="text-right">Valeur</TableHead>
                        <TableHead>Lot</TableHead>
                        <TableHead className="pr-5">Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockItems.map((item) => {
                        const status = statusOf(item)
                        return (
                          <TableRow key={item.id} className="transition-colors hover:bg-muted/40">
                            <TableCell className="pl-5">
                              <Link
                                href={`/dashboard/products/${item.product_id}`}
                                className="text-sm font-medium text-foreground transition-colors hover:text-brand-strong"
                              >
                                {item.product_name}
                              </Link>
                              {item.brand && <p className="text-xs text-muted-foreground">{item.brand}</p>}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{item.packaging_name || 'Standard'}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{item.depot_name}</TableCell>
                            <TableCell
                              className={`tabular text-right text-sm font-semibold ${status.tone === 'danger' ? 'text-destructive' : 'text-foreground'}`}
                            >
                              {formatNumber(item.quantity)}
                            </TableCell>
                            <TableCell className="tabular text-right text-sm text-muted-foreground">{formatMoney(item.avg_cost)}</TableCell>
                            <TableCell className="tabular text-right text-sm font-medium text-foreground">
                              {formatMoney(item.stock_value)}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{item.lot_number || '—'}</TableCell>
                            <TableCell className="pr-5">
                              <div className="flex items-center gap-2">
                                <StatusBadge label={status.label} tone={status.tone} />
                                {item.unit_variant_id && item.depot_id && item.quantity > 0 && Number(item.units_per_case ?? 1) > 1 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => openUnpack(`${item.variant_id}:${item.depot_id}`)}
                                    aria-label={`Ouvrir un casier de ${item.product_name}`}
                                  >
                                    <PackageOpen className="h-3.5 w-3.5" aria-hidden="true" />
                                    Ouvrir
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Cartes (mobile) */}
                <ul className="divide-y divide-border md:hidden">
                  {stockItems.map((item) => {
                    const status = statusOf(item)
                    return (
                      <li key={item.id}>
                        <Link
                          href={`/dashboard/products/${item.product_id}`}
                          className="block px-4 py-3.5 transition-colors hover:bg-muted/40"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">{item.product_name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {item.packaging_name || 'Standard'} · {item.depot_name}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="tabular text-sm font-semibold text-foreground">{formatMoney(item.stock_value)}</p>
                              <p className={`tabular text-xs ${status.tone === 'danger' ? 'text-destructive' : 'text-muted-foreground'}`}>
                                {formatNumber(item.quantity)} unités
                              </p>
                            </div>
                          </div>
                          <div className="mt-2">
                            <StatusBadge label={status.label} tone={status.tone} />
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </TabsContent>

          {/* Onglet emballages */}
          <TabsContent value="packaging" className="mt-0">
            {packagingError ? (
              <ErrorState description="Le stock d'emballages n'a pas pu être chargé." onRetry={retry} />
            ) : packagingStock.length === 0 ? (
              <EmptyState
                icon={BoxesIcon}
                title="Aucun stock d'emballages"
                description="Les emballages apparaîtront ici après un approvisionnement."
                action={{ label: 'Voir les emballages', href: '/dashboard/packaging' }}
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-5">Emballage</TableHead>
                        <TableHead>Dépôt</TableHead>
                        <TableHead className="text-right">Quantité</TableHead>
                        <TableHead className="pr-5 text-right">Consigne</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {packagingStock.map((pkg, idx) => (
                        <TableRow key={idx} className="transition-colors hover:bg-muted/40">
                          <TableCell className="pl-5 text-sm font-medium text-foreground">
                            {String(pkg.packaging_name || pkg.name || 'N/A')}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{String(pkg.depot_name || 'N/A')}</TableCell>
                          <TableCell className="tabular text-right text-sm font-semibold text-foreground">
                            {formatNumber(pkg.quantity)}
                          </TableCell>
                          <TableCell className="tabular pr-5 text-right text-sm text-muted-foreground">
                            {formatMoney(Number(pkg.deposit_price || 0))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ul className="divide-y divide-border md:hidden">
                  {packagingStock.map((pkg, idx) => (
                    <li key={idx} className="flex items-start justify-between gap-3 px-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {String(pkg.packaging_name || pkg.name || 'N/A')}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{String(pkg.depot_name || 'N/A')}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular text-sm font-semibold text-foreground">{formatNumber(pkg.quantity)}</p>
                        <p className="tabular text-xs text-muted-foreground">
                          Consigne {formatMoney(Number(pkg.deposit_price || 0))}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          {/* Onglet alertes */}
          <TabsContent value="alerts" className="mt-0">
            {loading ? (
              <div className="rounded-xl border border-border bg-card p-5">
                <TableSkeleton rows={4} columns={3} />
              </div>
            ) : loadError ? (
              <ErrorState description="Le stock n'a pas pu être chargé." onRetry={retry} />
            ) : alertCount === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Aucune alerte"
                description="Tous les niveaux de stock sont normaux."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
                <ul className="divide-y divide-border">
                  {lowStockItems.map((item) => (
                    <li key={`low-${item.id}`} className="flex items-center gap-4 px-5 py-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                        <TrendingDown className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {item.product_name} — {item.packaging_name || 'Standard'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Stock <span className="tabular font-semibold text-foreground">{formatNumber(item.quantity)}</span>
                          {' '}· seuil <span className="tabular">{formatNumber(item.min_stock_alert)}</span> · {item.depot_name}
                        </p>
                      </div>
                      <StatusBadge
                        label={item.quantity <= 0 ? 'Rupture' : 'Stock bas'}
                        tone={item.quantity <= 0 ? 'danger' : 'warning'}
                      />
                    </li>
                  ))}
                  {expiringItems.map((item) => {
                    const daysLeft = Math.ceil(
                      (new Date(item.expiry_date!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                    )
                    return (
                      <li key={`exp-${item.id}`} className="flex items-center gap-4 px-5 py-4">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning-foreground">
                          <Clock className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {item.product_name} — {item.packaging_name || 'Standard'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Expire dans{' '}
                            <span className="tabular font-semibold text-foreground">
                              {daysLeft} jour{daysLeft > 1 ? 's' : ''}
                            </span>
                            {' '}· lot {item.lot_number || 'N/A'} · {item.depot_name}
                          </p>
                        </div>
                        <StatusBadge label="Expiration" tone="warning" />
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </TabsContent>

          {/* Onglet ouvertures de casier */}
          <TabsContent value="unpacks" className="mt-0">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
              {activeTab === 'unpacks' && <UnpackHistory reloadKey={reloadKey} />}
            </div>
          </TabsContent>
        </Tabs>
        <UnpackStockDialog
          open={unpackOpen}
          onOpenChange={setUnpackOpen}
          options={unpackOptions}
          defaultKey={unpackKey}
          onDone={retry}
        />
        {barcodeDialog}
      </PageShell>
    </div>
  )
}
