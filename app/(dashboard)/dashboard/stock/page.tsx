'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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

  const totalValue = stockItems.reduce(
    (sum, s) => sum + s.quantity * s.price,
    0
  )

  const statCards = [
    {
      title: 'Références en stock',
      value: formatNumber(totalProducts),
      description: 'Variantes produit',
      icon: Package,
      color: 'bg-blue-500/10 text-blue-600',
    },
    {
      title: 'Valeur du stock',
      value: formatMoney(totalValue),
      description: 'Au prix de vente',
      icon: Warehouse,
      color: 'bg-emerald-500/10 text-emerald-600',
    },
    {
      title: 'Stock bas',
      value: lowStockItems.length.toString(),
      description: 'Sous le seuil d\'alerte',
      icon: TrendingDown,
      color: 'bg-rose-500/10 text-rose-600',
    },
    {
      title: 'Expirations proches',
      value: expiringItems.length.toString(),
      description: 'Dans les 30 prochains jours',
      icon: Clock,
      color: 'bg-amber-500/10 text-amber-600',
    },
  ]

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      <DashboardHeader
        title="Gestion du Stock"
        description="Suivi en temps réel de votre inventaire produits et emballages"
      />

      <main className="flex-1 p-4 lg:p-6 space-y-6 ">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {statCards.map((stat) => (
            <div
              key={stat.title}
              className="bg-white rounded-lg border border-zinc-200/80 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-zinc-500">{stat.title}</span>
                <stat.icon className="h-3.5 w-3.5 text-zinc-400" />
              </div>
              <p className="text-lg sm:text-xl font-bold text-zinc-950 tracking-tight truncate">{stat.value}</p>
              <p className="text-xs text-zinc-500 mt-1">{stat.description}</p>
            </div>
          ))}
        </div>

        {/* Search + Tabs */}
        <div className="rounded-lg bg-white border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-950">Inventaire</h3>
                <p className="text-xs text-slate-400 mt-0.5">Stock par produit et emballage</p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
                <Input
                  placeholder="Rechercher un produit..."
                  aria-label="Rechercher un produit"
                  className="pl-9 h-9 text-sm rounded-md bg-slate-50 border-transparent focus:bg-white"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <Select
                value={category}
                onValueChange={(v) => {
                  setCategory(v)
                  setProductId(ALL)
                }}
              >
                <SelectTrigger className="h-9 w-full sm:w-48 text-sm" aria-label="Filtrer par catégorie">
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
                <SelectTrigger className="h-9 w-full sm:w-56 text-sm" aria-label="Filtrer par produit">
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
              <div className="flex items-center gap-2">
                <Switch id="low-stock-only" checked={lowStockOnly} onCheckedChange={setLowStockOnly} />
                <Label htmlFor="low-stock-only" className="text-sm text-slate-600">
                  Stock bas uniquement
                </Label>
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="px-4 sm:px-6 pt-3 overflow-x-auto">
              <TabsList className="bg-slate-100 rounded-md p-1 h-9 sm:h-10 w-full sm:w-auto">
                <TabsTrigger
                  value="products"
                  className="rounded-lg px-3 sm:px-5 font-semibold text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <Package className="h-3.5 w-3.5 mr-1 sm:mr-2" />
                  Produits ({totalProducts})
                </TabsTrigger>
                <TabsTrigger
                  value="packaging"
                  className="rounded-lg px-3 sm:px-5 font-semibold text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <BoxesIcon className="h-3.5 w-3.5 mr-1 sm:mr-2" />
                  Emball. ({packagingStock.length})
                </TabsTrigger>
                <TabsTrigger
                  value="alerts"
                  className="rounded-lg px-3 sm:px-5 font-semibold text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-1 sm:mr-2" />
                  Alertes ({lowStockItems.length + expiringItems.length})
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Products Tab */}
            <TabsContent value="products" className="p-2 mt-0">
              {loading ? (
                <div className="p-4">
                  <TableSkeleton rows={6} columns={6} />
                </div>
              ) : loadError ? (
                <ErrorState className="m-4" description="Le stock n'a pas pu être chargé." onRetry={retry} />
              ) : stockItems.length === 0 ? (
                hasFilters ? (
                  <EmptyState
                    className="m-4"
                    icon={Package}
                    title="Aucun résultat"
                    description="Aucune ligne de stock ne correspond à ces filtres."
                    action={{
                      label: 'Réinitialiser les filtres',
                      onClick: () => {
                        setSearch('')
                        setCategory(ALL)
                        setProductId(ALL)
                        setLowStockOnly(false)
                      },
                    }}
                  />
                ) : (
                  <EmptyState
                    className="m-4"
                    icon={Package}
                    title="Aucun stock"
                    description="Commencez par créer des produits et faire un approvisionnement."
                    action={{ label: 'Nouvel approvisionnement', href: '/dashboard/procurement/new' }}
                  />
                )
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50/50">
                        <TableRow className="border-none hover:bg-transparent">
                          <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 pl-4">Produit</TableHead>
                          <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Format</TableHead>
                          <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Dépôt</TableHead>
                          <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-right">Qté</TableHead>
                          <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-right">Prix</TableHead>
                          <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-right">Valeur</TableHead>
                          <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Lot</TableHead>
                          <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 pr-4">Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stockItems.map((item) => {
                          const isLow = item.quantity <= item.min_stock_alert
                          const isExpiring = item.expiry_date && Math.ceil(
                            (new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                          ) <= 30
                          return (
                            <TableRow key={item.id} className="group border-b border-slate-50 hover:bg-slate-50/50">
                              <TableCell className="py-3 pl-4">
                                <span className="font-semibold text-sm text-slate-950">{item.product_name}</span>
                                {item.brand && <span className="text-[11px] text-slate-400 ml-1">{item.brand}</span>}
                              </TableCell>
                              <TableCell className="py-3">
                                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[10px] font-semibold text-blue-600">
                                  {item.packaging_name || 'Standard'}
                                </span>
                              </TableCell>
                              <TableCell className="py-3 text-sm text-slate-600">{item.depot_name}</TableCell>
                              <TableCell className="py-3 text-right">
                                <span className={`font-semibold ${isLow ? 'text-rose-600' : 'text-slate-950'}`}>{formatNumber(item.quantity)}</span>
                              </TableCell>
                              <TableCell className="py-3 text-right text-sm text-slate-600">{formatMoney(item.price)}</TableCell>
                              <TableCell className="py-3 text-right text-sm font-semibold text-slate-950">{formatMoney(item.quantity * item.price)}</TableCell>
                              <TableCell className="py-3 text-xs font-mono text-slate-500">{item.lot_number || '—'}</TableCell>
                              <TableCell className="py-3 pr-4">
                                {isLow ? (
                                  <Badge className="text-[10px] font-medium bg-rose-50 text-rose-600 border-none">Stock bas</Badge>
                                ) : isExpiring ? (
                                  <Badge className="text-[10px] font-medium bg-amber-50 text-amber-600 border-none">Expire</Badge>
                                ) : (
                                  <Badge className="text-[10px] font-medium bg-emerald-50 text-emerald-600 border-none">OK</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-zinc-100">
                    {stockItems.map((item) => {
                      const isLow = item.quantity <= item.min_stock_alert
                      const isExpiring = item.expiry_date && Math.ceil(
                        (new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                      ) <= 30
                      return (
                        <div key={item.id} className="p-4">
                          <div className="flex items-start justify-between mb-1.5">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-zinc-950 truncate">{item.product_name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{item.packaging_name || 'Standard'}</span>
                                <span className="text-xs text-zinc-400">{item.depot_name}</span>
                              </div>
                            </div>
                            {isLow ? (
                              <Badge className="text-[10px] font-medium bg-rose-50 text-rose-600 border-none ml-2 shrink-0">Bas</Badge>
                            ) : isExpiring ? (
                              <Badge className="text-[10px] font-medium bg-amber-50 text-amber-600 border-none ml-2 shrink-0">Expire</Badge>
                            ) : (
                              <Badge className="text-[10px] font-medium bg-emerald-50 text-emerald-600 border-none ml-2 shrink-0">OK</Badge>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className={`text-sm font-bold ${isLow ? 'text-rose-600' : 'text-zinc-950'}`}>{formatNumber(item.quantity)} unités</span>
                            <span className="text-sm font-semibold text-zinc-950">{formatMoney(item.quantity * item.price)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </TabsContent>

            {/* Packaging Tab */}
            <TabsContent value="packaging" className="p-2 mt-0">
              {packagingError ? (
                <ErrorState className="m-4" description="Le stock d'emballages n'a pas pu être chargé." onRetry={retry} />
              ) : packagingStock.length === 0 ? (
                <EmptyState
                  className="m-4"
                  icon={BoxesIcon}
                  title="Aucun stock d'emballages"
                  description="Les emballages apparaîtront ici après un approvisionnement."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50/50">
                      <TableRow className="border-none hover:bg-transparent">
                        <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 pl-8">Emballage</TableHead>
                        <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Dépôt</TableHead>
                        <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">Quantité</TableHead>
                        <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right pr-8">Consigne</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {packagingStock.map((pkg, idx) => (
                        <TableRow key={idx} className="group border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <TableCell className="py-6 pl-8 font-semibold text-slate-950">
                            {String(pkg.packaging_name || pkg.name || 'N/A')}
                          </TableCell>
                          <TableCell className="py-6 font-bold text-slate-600">
                            {String(pkg.depot_name || 'N/A')}
                          </TableCell>
                          <TableCell className="py-6 text-right font-semibold text-slate-950 text-base">
                            {formatNumber(pkg.quantity)}
                          </TableCell>
                          <TableCell className="py-6 text-right font-bold text-slate-600 pr-8">
                            {formatMoney(Number(pkg.deposit_price || 0))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Alerts Tab */}
            <TabsContent value="alerts" className="p-6 mt-0">
              {loading ? (
                <TableSkeleton rows={4} columns={3} />
              ) : loadError ? (
                <ErrorState description="Le stock n'a pas pu être chargé." onRetry={retry} />
              ) : lowStockItems.length === 0 && expiringItems.length === 0 ? (
                <div className="text-center py-24 flex flex-col items-center">
                  <div className="h-24 w-24 rounded-full bg-emerald-50 flex items-center justify-center mb-6">
                    <AlertTriangle className="h-10 w-10 text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-950">Aucune alerte</h3>
                  <p className="mt-2 text-slate-400 font-medium max-w-xs mx-auto">
                    Tous les niveaux de stock sont normaux.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {lowStockItems.map((item) => (
                    <Card key={`low-${item.id}`} className="rounded-md border-rose-200/50 bg-rose-50/30">
                      <CardContent className="flex items-center gap-4 py-4 px-6">
                        <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center">
                          <TrendingDown className="h-5 w-5 text-rose-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-slate-950">{item.product_name} — {item.packaging_name || 'Standard'}</p>
                          <p className="text-sm text-slate-500">
                            Stock: <span className="font-bold text-rose-600">{formatNumber(item.quantity)}</span> / Seuil: {item.min_stock_alert} — {item.depot_name}
                          </p>
                        </div>
                        <Badge className="rounded-xl bg-rose-100 text-rose-600 border-none font-bold">Stock bas</Badge>
                      </CardContent>
                    </Card>
                  ))}
                  {expiringItems.map((item) => {
                    const daysLeft = Math.ceil(
                      (new Date(item.expiry_date!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                    )
                    return (
                      <Card key={`exp-${item.id}`} className="rounded-md border-amber-200/50 bg-amber-50/30">
                        <CardContent className="flex items-center gap-4 py-4 px-6">
                          <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                            <Clock className="h-5 w-5 text-amber-600" />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-slate-950">{item.product_name} — {item.packaging_name || 'Standard'}</p>
                            <p className="text-sm text-slate-500">
                              Expire dans <span className="font-bold text-amber-600">{daysLeft} jour{daysLeft > 1 ? 's' : ''}</span> — Lot: {item.lot_number || 'N/A'} — {item.depot_name}
                            </p>
                          </div>
                          <Badge className="rounded-xl bg-amber-100 text-amber-600 border-none font-bold">Expiration</Badge>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}
