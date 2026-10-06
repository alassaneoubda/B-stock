import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { SubscriptionBanner } from '@/components/dashboard/subscription-banner'
import {
  DollarSign,
  TrendingUp,
  Users,
  Package,
  Truck,
  ShoppingCart,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Circle,
} from 'lucide-react'
import Link from 'next/link'
import { formatMoney, formatDateTime } from '@/lib/format'

// Les erreurs SQL ne sont plus converties en zéros trompeurs : elles remontent
// jusqu'à error.tsx, qui propose de réessayer.
async function getDashboardStats(companyId: string) {
  const [products, clients, todaySales, pendingDeliveries, recentSales, openCash, anySale] = await Promise.all([
    sql`SELECT COUNT(*) as count FROM products WHERE company_id = ${companyId} AND is_active = true`,
    sql`SELECT COUNT(*) as count FROM clients WHERE company_id = ${companyId} AND is_active = true AND is_walk_in = false`,
    sql`
      SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
      FROM sales_orders
      WHERE company_id = ${companyId}
      AND DATE(created_at) = CURRENT_DATE
      AND status != 'cancelled'
    `,
    sql`
      SELECT COUNT(*) as count FROM delivery_tours WHERE company_id = ${companyId} AND status IN ('planned', 'in_progress')
    `,
    sql`
      SELECT so.id, so.order_number, so.status, so.total_amount, so.created_at, c.name as client_name
      FROM sales_orders so
      LEFT JOIN clients c ON c.id = so.client_id AND c.company_id = so.company_id
      WHERE so.company_id = ${companyId}
      ORDER BY so.created_at DESC
      LIMIT 5
    `,
    sql`SELECT 1 FROM cash_sessions WHERE company_id = ${companyId} AND status = 'open' LIMIT 1`,
    sql`SELECT 1 FROM sales_orders WHERE company_id = ${companyId} LIMIT 1`,
  ])

  return {
    totalProducts: Number(products[0]?.count || 0),
    totalClients: Number(clients[0]?.count || 0),
    todaySalesTotal: Number(todaySales[0]?.total || 0),
    todaySalesCount: Number(todaySales[0]?.count || 0),
    pendingDeliveries: Number(pendingDeliveries[0]?.count || 0),
    recentSales,
    hasOpenCashSession: openCash.length > 0,
    hasAnySale: anySale.length > 0,
  }
}

// Le statut est toujours écrit en toutes lettres (la couleur n'est qu'un appoint)
const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: 'En attente', className: 'bg-amber-50 text-amber-700' },
  confirmed: { label: 'Confirmée', className: 'bg-emerald-50 text-emerald-700' },
  preparing: { label: 'En préparation', className: 'bg-blue-50 text-blue-700' },
  ready: { label: 'Prête', className: 'bg-blue-50 text-blue-700' },
  delivered: { label: 'Livrée', className: 'bg-emerald-50 text-emerald-700' },
  completed: { label: 'Terminée', className: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Annulée', className: 'bg-zinc-100 text-zinc-600' },
}

function statusBadge(status: string) {
  return STATUS_BADGES[status] ?? { label: status, className: 'bg-zinc-100 text-zinc-600' }
}

export default async function DashboardPage() {
  const session = await requirePageSession()
  const companyId = session?.user?.companyId || ''
  const stats = await getDashboardStats(companyId)

  const onboardingSteps = [
    { done: stats.totalProducts > 0, label: 'Ajouter vos produits', href: '/dashboard/products/new' },
    { done: stats.totalClients > 0, label: 'Ajouter un premier client', href: '/dashboard/clients/new' },
    { done: stats.hasOpenCashSession || stats.hasAnySale, label: 'Ouvrir la caisse', href: '/dashboard/cash' },
    { done: stats.hasAnySale, label: 'Enregistrer une première vente', href: '/dashboard/sales/new' },
  ]
  const completedSteps = onboardingSteps.filter((step) => step.done).length

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      <DashboardHeader title="Tableau de bord" />

      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        {/* Subscription Banner */}
        <SubscriptionBanner />

        {/* Démarrage : visible tant qu'au moins une étape reste à faire */}
        {completedSteps < onboardingSteps.length && (
          <section className="bg-white rounded-lg border border-zinc-200/80" aria-labelledby="onboarding-title">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
              <h2 id="onboarding-title" className="text-sm font-semibold text-zinc-950">Bien démarrer</h2>
              <span className="text-xs text-zinc-500">
                {completedSteps}/{onboardingSteps.length} étapes terminées
              </span>
            </div>
            <ul className="divide-y divide-zinc-100">
              {onboardingSteps.map((step) => (
                <li key={step.href}>
                  {step.done ? (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                      <span className="text-sm text-zinc-500 line-through">{step.label}</span>
                      <span className="sr-only">(terminé)</span>
                    </div>
                  ) : (
                    <Link href={step.href} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors group">
                      <Circle className="h-4 w-4 text-zinc-300" aria-hidden="true" />
                      <span className="text-sm font-medium text-zinc-800 group-hover:text-zinc-950">{step.label}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-zinc-400 ml-auto" aria-hidden="true" />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg border border-zinc-200/80 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-zinc-500">CA du jour</span>
              <DollarSign className="h-3.5 w-3.5 text-zinc-400" />
            </div>
            <p className="text-lg sm:text-xl font-bold text-zinc-950 tracking-tight truncate">{formatMoney(stats.todaySalesTotal)}</p>
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
              <div className="p-8 text-center text-sm text-zinc-500">
                Aucune vente pour l&apos;instant.{' '}
                <Link href="/dashboard/sales/new" className="font-medium text-blue-600 hover:text-blue-700">
                  Enregistrer une vente
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {stats.recentSales.map((sale: any) => {
                  const badge = statusBadge(sale.status)
                  return (
                    <Link
                      key={sale.id}
                      href={`/dashboard/sales/${sale.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-900 truncate">
                          {sale.client_name || 'Client passager'}
                        </p>
                        <p className="text-xs text-zinc-500">
                          #{sale.order_number} · {formatDateTime(sale.created_at)}
                        </p>
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <p className="text-sm font-semibold text-zinc-950">{formatMoney(sale.total_amount)}</p>
                        <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                    </Link>
                  )
                })}
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
                <span className="text-sm font-medium text-zinc-950">{formatMoney(stats.todaySalesTotal)}</span>
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
