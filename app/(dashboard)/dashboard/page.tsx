import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import {
  DollarSign,
  TrendingUp,
  Users,
  Package,
  Truck,
  ShoppingCart,
  ArrowRight,
  ArrowUpRight,
} from 'lucide-react'
import Link from 'next/link'

async function getDashboardStats(companyId: string) {
  try {
    const products = await sql`SELECT COUNT(*) as count FROM products WHERE company_id = ${companyId} AND is_active = true`
    const clients = await sql`SELECT COUNT(*) as count FROM clients WHERE company_id = ${companyId} AND is_active = true`
    const todaySales = await sql`
      SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
      FROM sales_orders 
      WHERE company_id = ${companyId} 
      AND DATE(created_at) = CURRENT_DATE
      AND status != 'cancelled'
    `
    const pendingDeliveries = await sql`
      SELECT COUNT(*) as count FROM delivery_tours WHERE company_id = ${companyId} AND status IN ('planned', 'in_progress')
    `
    const recentSales = await sql`
      SELECT so.*, c.name as client_name
      FROM sales_orders so
      LEFT JOIN clients c ON so.client_id = c.id
      WHERE so.company_id = ${companyId}
      ORDER BY so.created_at DESC
      LIMIT 5
    `

    return {
      totalProducts: Number(products[0]?.count || 0),
      totalClients: Number(clients[0]?.count || 0),
      todaySalesTotal: Number(todaySales[0]?.total || 0),
      todaySalesCount: Number(todaySales[0]?.count || 0),
      pendingDeliveries: Number(pendingDeliveries[0]?.count || 0),
      recentSales: recentSales || [],
    }
  } catch (error) {
    return { totalProducts: 0, totalClients: 0, todaySalesTotal: 0, todaySalesCount: 0, pendingDeliveries: 0, recentSales: [] }
  }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(amount)
}

function translateStatus(status: string) {
  const map: Record<string, string> = {
    confirmed: 'Confirmée',
    completed: 'Terminée',
    cancelled: 'Annulée',
    pending: 'En attente',
  }
  return map[status] || status
}

export default async function DashboardPage() {
  const session = await auth()
  const companyId = session?.user?.companyId || ''
  const stats = await getDashboardStats(companyId)

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      <DashboardHeader title="Tableau de bord" />

      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg border border-zinc-200/80 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-zinc-500">CA du jour</span>
              <DollarSign className="h-3.5 w-3.5 text-zinc-400" />
            </div>
            <p className="text-lg sm:text-xl font-bold text-zinc-950 tracking-tight truncate">{formatCurrency(stats.todaySalesTotal)}</p>
            <p className="text-xs text-zinc-500 mt-1">{stats.todaySalesCount} vente{stats.todaySalesCount !== 1 ? 's' : ''}</p>
          </div>

          <div className="bg-white rounded-lg border border-zinc-200/80 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-zinc-500">Clients actifs</span>
              <Users className="h-3.5 w-3.5 text-zinc-400" />
            </div>
            <p className="text-xl font-bold text-zinc-950 tracking-tight">{stats.totalClients}</p>
            <p className="text-xs text-zinc-500 mt-1">dans la base</p>
          </div>

          <div className="bg-white rounded-lg border border-zinc-200/80 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-zinc-500">Produits</span>
              <Package className="h-3.5 w-3.5 text-zinc-400" />
            </div>
            <p className="text-xl font-bold text-zinc-950 tracking-tight">{stats.totalProducts}</p>
            <p className="text-xs text-zinc-500 mt-1">au catalogue</p>
          </div>

          <div className="bg-white rounded-lg border border-zinc-200/80 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-zinc-500">Livraisons</span>
              <Truck className="h-3.5 w-3.5 text-zinc-400" />
            </div>
            <p className="text-xl font-bold text-zinc-950 tracking-tight">{stats.pendingDeliveries}</p>
            <p className="text-xs text-amber-600 mt-1">{stats.pendingDeliveries > 0 ? 'en cours' : 'aucune'}</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { title: 'Nouvelle vente', icon: ShoppingCart, href: '/dashboard/sales/new', color: 'text-blue-600 bg-blue-50' },
            { title: 'Nouveau client', icon: Users, href: '/dashboard/clients/new', color: 'text-emerald-600 bg-emerald-50' },
            { title: 'Nouvelle tournée', icon: Truck, href: '/dashboard/deliveries/new', color: 'text-purple-600 bg-purple-50' },
            { title: 'Voir le stock', icon: Package, href: '/dashboard/stock', color: 'text-orange-600 bg-orange-50' },
          ].map((action) => (
            <Link
              key={action.title}
              href={action.href}
              className="flex items-center gap-3 bg-white rounded-lg border border-zinc-200/80 p-3.5 hover:border-zinc-300 hover:shadow-sm transition-all group"
            >
              <div className={`h-8 w-8 rounded-md flex items-center justify-center ${action.color}`}>
                <action.icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-zinc-700 group-hover:text-zinc-950 transition-colors">{action.title}</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-zinc-300 ml-auto group-hover:text-zinc-500 transition-colors" />
            </Link>
          ))}
        </div>

        {/* Bottom: Recent sales + Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Recent Sales */}
          <div className="lg:col-span-2 bg-white rounded-lg border border-zinc-200/80">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
              <h2 className="text-sm font-semibold text-zinc-950">Ventes récentes</h2>
              <Link href="/dashboard/sales" className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
                Tout voir <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {stats.recentSales.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">Aucune vente récente</div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {stats.recentSales.map((sale: any) => (
                  <div key={sale.id} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">
                        {sale.client_name || 'Client passager'}
                      </p>
                      <p className="text-xs text-zinc-400">
                        #{sale.order_number} · {new Date(sale.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-zinc-950">{formatCurrency(Number(sale.total_amount))}</p>
                      <p className={`text-[10px] font-medium ${sale.status === 'completed' || sale.status === 'confirmed' ? 'text-emerald-600' : 'text-zinc-400'}`}>
                        {translateStatus(sale.status)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="bg-white rounded-lg border border-zinc-200/80">
            <div className="px-4 py-3 border-b border-zinc-100">
              <h2 className="text-sm font-semibold text-zinc-950">Résumé</h2>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-600">Livraisons en attente</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${stats.pendingDeliveries > 0 ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-500'}`}>
                  {stats.pendingDeliveries}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-600">Produits au catalogue</span>
                <span className="text-sm font-medium text-zinc-950">{stats.totalProducts}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-600">Revenus du jour</span>
                <span className="text-sm font-medium text-zinc-950">{formatCurrency(stats.todaySalesTotal)}</span>
              </div>
              <div className="pt-3 border-t border-zinc-100">
                <Link href="/dashboard/reports" className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  Voir les rapports <TrendingUp className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  )
}
