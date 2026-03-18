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
  ArrowUpDown,
  Warehouse,
  TrendingDown,
  Clock,
} from 'lucide-react'

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

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(amount)
}

export default function StockPage() {
  const { data: session } = useSession()
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [packagingStock, setPackagingStock] = useState<Array<Record<string, unknown>>>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('products')

  useEffect(() => {
    if (!session?.user?.companyId) return

    async function fetchData() {
      setLoading(true)
      try {
        // Fetch stock
        const stockRes = await fetch(`/api/stock?search=${encodeURIComponent(search)}`)
        const stockData = await stockRes.json()
        if (stockData.success) {
          setStockItems(stockData.data)
        }

        // Fetch packaging stock
        const pkgRes = await fetch('/api/packaging/stock')
        const pkgData = await pkgRes.json()
        if (pkgData.success) {
          setPackagingStock(pkgData.data)
        }
      } catch (error) {
        console.error('Error fetching stock:', error)
      }
      setLoading(false)
    }

    fetchData()
  }, [session?.user?.companyId, search])

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
      value: totalProducts.toString(),
      description: 'Variantes produit',
      icon: Package,
      color: 'bg-blue-500/10 text-blue-600',
    },
    {
      title: 'Valeur du stock',
      value: formatCurrency(totalValue),
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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <div
              key={stat.title}
              className="group relative overflow-hidden rounded-lg bg-white p-8 shadow-sm border border-slate-200/60 hover:shadow-md hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-500"
            >
              <div className="relative z-10 flex flex-col gap-6">
                <div className={`flex h-14 w-14 items-center justify-center rounded-md ${stat.color}`}>
                  <stat.icon className="h-7 w-7" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">{stat.title}</p>
                  <div className="text-3xl font-semibold text-slate-950 tracking-tight">{stat.value}</div>
                  <p className="text-sm font-bold text-slate-400 mt-2">{stat.description}</p>
                </div>
              </div>
              <div className="absolute -right-4 -bottom-4 h-32 w-32 bg-slate-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-700" />
            </div>
          ))}
        </div>

        {/* Search + Tabs */}
        <div className="rounded-lg bg-white border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-8 py-8 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div>
                <h3 className="text-2xl font-semibold text-slate-950 tracking-tight">Inventaire</h3>
                <p className="text-sm font-medium text-slate-400 mt-1">Stock par produit et emballage</p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Rechercher un produit..."
                  className="pl-11 h-12 rounded-md bg-slate-50 border-transparent focus:bg-white focus:ring-blue-500"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="px-8 pt-4">
              <TabsList className="bg-slate-100 rounded-md p-1 h-12">
                <TabsTrigger
                  value="products"
                  className="rounded-xl px-6 font-bold text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <Package className="h-4 w-4 mr-2" />
                  Produits ({totalProducts})
                </TabsTrigger>
                <TabsTrigger
                  value="packaging"
                  className="rounded-xl px-6 font-bold text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <BoxesIcon className="h-4 w-4 mr-2" />
                  Emballages ({packagingStock.length})
                </TabsTrigger>
                <TabsTrigger
                  value="alerts"
                  className="rounded-xl px-6 font-bold text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Alertes ({lowStockItems.length + expiringItems.length})
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Products Tab */}
            <TabsContent value="products" className="p-2 mt-0">
              {loading ? (
                <div className="text-center py-24 text-slate-400 font-medium">Chargement...</div>
              ) : stockItems.length === 0 ? (
                <div className="text-center py-24 flex flex-col items-center">
                  <div className="h-24 w-24 rounded-full bg-slate-50 flex items-center justify-center mb-6">
                    <Package className="h-10 w-10 text-slate-300" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-950">Aucun stock</h3>
                  <p className="mt-2 text-slate-400 font-medium max-w-xs mx-auto">
                    Commencez par créer des produits et faire un approvisionnement.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50/50">
                      <TableRow className="border-none hover:bg-transparent">
                        <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 pl-8">Produit</TableHead>
                        <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Format</TableHead>
                        <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Dépôt</TableHead>
                        <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">Quantité</TableHead>
                        <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">Prix</TableHead>
                        <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">Valeur</TableHead>
                        <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Lot</TableHead>
                        <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 pr-8">Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockItems.map((item) => {
                        const isLow = item.quantity <= item.min_stock_alert
                        const isExpiring = item.expiry_date && Math.ceil(
                          (new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                        ) <= 30

                        return (
                          <TableRow key={item.id} className="group border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                            <TableCell className="py-6 pl-8">
                              <div className="flex flex-col">
                                <span className="font-semibold text-slate-950">{item.product_name}</span>
                                {item.brand && (
                                  <span className="text-[11px] font-bold text-slate-400 mt-1">{item.brand}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-6">
                              <span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 text-[10px] font-semibold text-blue-600 uppercase tracking-wider">
                                {item.packaging_name || 'Standard'}
                              </span>
                            </TableCell>
                            <TableCell className="py-6 font-bold text-slate-600">{item.depot_name}</TableCell>
                            <TableCell className="py-6 text-right">
                              <span className={`font-semibold text-base ${isLow ? 'text-rose-600' : 'text-slate-950'}`}>
                                {item.quantity}
                              </span>
                            </TableCell>
                            <TableCell className="py-6 text-right font-bold text-slate-600">
                              {formatCurrency(item.price)}
                            </TableCell>
                            <TableCell className="py-6 text-right font-semibold text-slate-950">
                              {formatCurrency(item.quantity * item.price)}
                            </TableCell>
                            <TableCell className="py-6 text-slate-500 text-sm font-mono">
                              {item.lot_number || '—'}
                            </TableCell>
                            <TableCell className="py-6 pr-8">
                              {isLow ? (
                                <Badge className="rounded-xl px-4 py-1 font-semibold uppercase text-[10px] tracking-wider bg-rose-50 text-rose-600 border-none shadow-none">
                                  Stock bas
                                </Badge>
                              ) : isExpiring ? (
                                <Badge className="rounded-xl px-4 py-1 font-semibold uppercase text-[10px] tracking-wider bg-amber-50 text-amber-600 border-none shadow-none">
                                  Expire bientôt
                                </Badge>
                              ) : (
                                <Badge className="rounded-xl px-4 py-1 font-semibold uppercase text-[10px] tracking-wider bg-emerald-50 text-emerald-600 border-none shadow-none">
                                  OK
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Packaging Tab */}
            <TabsContent value="packaging" className="p-2 mt-0">
              {packagingStock.length === 0 ? (
                <div className="text-center py-24 flex flex-col items-center">
                  <div className="h-24 w-24 rounded-full bg-slate-50 flex items-center justify-center mb-6">
                    <BoxesIcon className="h-10 w-10 text-slate-300" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-950">Aucun stock d&apos;emballages</h3>
                  <p className="mt-2 text-slate-400 font-medium max-w-xs mx-auto">
                    Les emballages apparaîtront ici après un approvisionnement.
                  </p>
                </div>
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
                            {Number(pkg.quantity)}
                          </TableCell>
                          <TableCell className="py-6 text-right font-bold text-slate-600 pr-8">
                            {formatCurrency(Number(pkg.deposit_price || 0))}
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
              {lowStockItems.length === 0 && expiringItems.length === 0 ? (
                <div className="text-center py-24 flex flex-col items-center">
                  <div className="h-24 w-24 rounded-full bg-emerald-50 flex items-center justify-center mb-6">
                    <AlertTriangle className="h-10 w-10 text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-950">Aucune alerte</h3>
                  <p className="mt-2 text-slate-400 font-medium max-w-xs mx-auto">
                    Tous les niveaux de stock sont normaux. 🎉
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
                            Stock: <span className="font-bold text-rose-600">{item.quantity}</span> / Seuil: {item.min_stock_alert} — {item.depot_name}
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
