import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BarChart3, TrendingUp, Users, Package, CreditCard, ShoppingCart, ArrowUpRight, ArrowDownRight, PieChart, Wallet, Boxes, Truck } from 'lucide-react'

async function getReportData(companyId: string) {
    try {
        // Sales by month (last 6 months)
        const salesByMonth = await sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') as month,
        DATE_TRUNC('month', created_at) as month_date,
        COALESCE(SUM(total_amount), 0) as total,
        COUNT(*) as count
      FROM sales_orders
      WHERE company_id = ${companyId}
        AND status != 'cancelled'
        AND created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month_date DESC
    `

        // Top clients by sales
        const topClients = await sql`
      SELECT
        c.name,
        COALESCE(SUM(so.total_amount), 0) as total_sales,
        COUNT(so.id) as orders_count
      FROM clients c
      LEFT JOIN sales_orders so ON so.client_id = c.id AND so.company_id = ${companyId} AND so.status != 'cancelled'
      WHERE c.company_id = ${companyId}
      GROUP BY c.id, c.name
      ORDER BY total_sales DESC
      LIMIT 5
    `

        // Total credit outstanding
        const creditStats = await sql`
      SELECT
        COALESCE(SUM(CASE WHEN ca.account_type = 'product' AND ca.balance < 0 THEN ABS(ca.balance) ELSE 0 END), 0) as product_debt,
        COALESCE(SUM(CASE WHEN ca.account_type = 'packaging' AND ca.balance < 0 THEN ABS(ca.balance) ELSE 0 END), 0) as packaging_debt
      FROM client_accounts ca
      JOIN clients c ON ca.client_id = c.id
      WHERE c.company_id = ${companyId}
    `

        // Stock value
        const stockValue = await sql`
      SELECT
        COALESCE(SUM(s.quantity * pv.cost_price), 0) as total_value,
        COALESCE(SUM(s.quantity), 0) as total_units
      FROM stock s
      JOIN product_variants pv ON s.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE p.company_id = ${companyId}
    `

        // Payment method breakdown
        const paymentMethods = await sql`
      SELECT
        payment_method,
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total
      FROM sales_orders
      WHERE company_id = ${companyId}
        AND status != 'cancelled'
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
      GROUP BY payment_method
    `

        // Top products by revenue this month
        const topProducts = await sql`
      SELECT
        p.name as product_name,
        pt.name as packaging_name,
        COALESCE(SUM(soi.quantity * soi.unit_price), 0) as revenue,
        COALESCE(SUM(soi.quantity), 0) as units_sold
      FROM sales_order_items soi
      JOIN product_variants pv ON soi.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      JOIN packaging_types pt ON pv.packaging_type_id = pt.id
      JOIN sales_orders so ON soi.sales_order_id = so.id
      WHERE so.company_id = ${companyId}
        AND so.status != 'cancelled'
        AND DATE_TRUNC('month', so.created_at) = DATE_TRUNC('month', NOW())
      GROUP BY p.name, pt.name
      ORDER BY revenue DESC
      LIMIT 8
    `

        // Procurement spend this month
        const procurementSpend = await sql`
      SELECT
        COALESCE(SUM(total_amount), 0) as total,
        COUNT(*) as count
      FROM purchase_orders
      WHERE company_id = ${companyId}
        AND status != 'cancelled'
        AND DATE_TRUNC('month', ordered_at) = DATE_TRUNC('month', NOW())
    `

        // Daily sales for current month
        const dailySales = await sql`
      SELECT
        DATE(created_at) as day,
        COALESCE(SUM(total_amount), 0) as total,
        COUNT(*) as count
      FROM sales_orders
      WHERE company_id = ${companyId}
        AND status != 'cancelled'
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `

        return {
            salesByMonth: salesByMonth as Array<{ month: string; total: number; count: number }>,
            topClients: topClients as Array<{ name: string; total_sales: number; orders_count: number }>,
            productDebt: Number(creditStats[0]?.product_debt || 0),
            packagingDebt: Number(creditStats[0]?.packaging_debt || 0),
            stockValue: Number(stockValue[0]?.total_value || 0),
            stockUnits: Number(stockValue[0]?.total_units || 0),
            paymentMethods: paymentMethods as Array<{ payment_method: string; count: number; total: number }>,
            topProducts: topProducts as Array<{ product_name: string; packaging_name: string; revenue: number; units_sold: number }>,
            procurementTotal: Number(procurementSpend[0]?.total || 0),
            procurementCount: Number(procurementSpend[0]?.count || 0),
            dailySales: dailySales as Array<{ day: string; total: number; count: number }>,
        }
    } catch {
        return {
            salesByMonth: [],
            topClients: [],
            productDebt: 0,
            packagingDebt: 0,
            stockValue: 0,
            stockUnits: 0,
            paymentMethods: [],
            topProducts: [],
            procurementTotal: 0,
            procurementCount: 0,
            dailySales: [],
        }
    }
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'XOF',
        minimumFractionDigits: 0,
    }).format(amount)
}

const paymentLabels: Record<string, string> = {
    cash: 'Espèces',
    mobile_money: 'Mobile Money',
    credit: 'Crédit',
    mixed: 'Mixte',
}

export default async function ReportsPage() {
    const session = await auth()
    const companyId = session?.user?.companyId || ''
    const data = await getReportData(companyId)

    const currentMonthSales = data.salesByMonth[0]

    const kpiData = [
        {
            title: "Ventes ce Mois",
            value: formatCurrency(Number(currentMonthSales?.total || 0)),
            description: `${currentMonthSales?.count || 0} commandes validées`,
            icon: ShoppingCart,
            color: "bg-blue-500/10 text-blue-600",
        },
        {
            title: "Achats ce Mois",
            value: formatCurrency(data.procurementTotal),
            description: `${data.procurementCount} commande(s) fournisseur`,
            icon: Truck,
            color: "bg-indigo-500/10 text-indigo-600",
        },
        {
            title: "Créances Produits",
            value: formatCurrency(data.productDebt),
            description: "Encours de paiement",
            icon: CreditCard,
            color: "bg-rose-500/10 text-rose-600",
        },
        {
            title: "Dettes Emballages",
            value: formatCurrency(data.packagingDebt),
            description: "Casiers à récupérer",
            icon: Package,
            color: "bg-amber-500/10 text-amber-600",
        },
        {
            title: "Valeur du Stock",
            value: formatCurrency(data.stockValue),
            description: `${data.stockUnits} unités en réserve`,
            icon: TrendingUp,
            color: "bg-emerald-500/10 text-emerald-600",
        },
        {
            title: "Marge Brute Est.",
            value: formatCurrency(Number(currentMonthSales?.total || 0) - data.procurementTotal),
            description: "Ventes - Achats ce mois",
            icon: Boxes,
            color: Number(currentMonthSales?.total || 0) - data.procurementTotal >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600",
        },
    ]

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title="Intelligence & Rapports"
                description="Suivez la performance et la santé financière de B-Stock"
            />

            <main className="flex-1 p-4 lg:p-6 space-y-6 ">
                {/* KPI Grid */}
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {kpiData.map((stat) => (
                        <div
                            key={stat.title}
                            className="group relative overflow-hidden rounded-lg bg-white p-8 shadow-sm border border-slate-200/60 hover:shadow-md hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-500"
                        >
                            <div className="relative z-10 flex flex-col gap-6">
                                <div className={`flex h-14 w-14 items-center justify-center rounded-md ${stat.color} transition-transform group-hover:scale-110 duration-500`}>
                                    <stat.icon className="h-7 w-7" />
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">{stat.title}</p>
                                    <div className="text-2xl font-semibold text-slate-950 tracking-tight">{stat.value}</div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <p className="text-sm font-bold text-slate-400">{stat.description}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="absolute -right-4 -bottom-4 h-32 w-32 bg-slate-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-700" />
                        </div>
                    ))}
                </div>

                <div className="grid gap-10 lg:grid-cols-2">
                    {/* Monthly Sales Chart-style Breakdown */}
                    <div className="rounded-lg bg-white border border-slate-200/60 shadow-sm overflow-hidden p-8">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-xl font-semibold text-slate-950 tracking-tight flex items-center gap-3">
                                    <BarChart3 className="h-6 w-6 text-blue-600" />
                                    Ventes par Mois
                                </h3>
                                <p className="text-sm font-medium text-slate-400 mt-1">Évolution des 6 derniers mois</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {data.salesByMonth.length === 0 ? (
                                <div className="text-center py-12 flex flex-col items-center">
                                    <div className="h-16 w-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                                        <BarChart3 className="h-8 w-8 text-slate-200" />
                                    </div>
                                    <p className="text-slate-400 font-bold text-sm">Données insuffisantes</p>
                                </div>
                            ) : (
                                data.salesByMonth.map((month) => {
                                    const maxSales = Math.max(...data.salesByMonth.map(m => Number(m.total)))
                                    const pct = maxSales > 0 ? (Number(month.total) / maxSales) * 100 : 0
                                    return (
                                        <div key={month.month} className="group/item">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{month.month}</span>
                                                <span className="text-sm font-semibold text-slate-950">{formatCurrency(Number(month.total))}</span>
                                            </div>
                                            <div className="relative h-4 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100/50">
                                                <div
                                                    className="absolute inset-y-0 left-0 bg-blue-600 rounded-full transition-all duration-1000 group-hover/item:bg-blue-500"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{month.count} commandes</span>
                                                <div className="flex items-center gap-1">
                                                    <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                                                    <span className="text-[10px] font-semibold text-emerald-500">+{Math.round(pct / 10)}%</span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>

                    {/* Top Clients Breakdown */}
                    <div className="rounded-lg bg-white border border-slate-200/60 shadow-sm overflow-hidden p-8">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-xl font-semibold text-slate-950 tracking-tight flex items-center gap-3">
                                    <PieChart className="h-6 w-6 text-emerald-600" />
                                    Top Clients
                                </h3>
                                <p className="text-sm font-medium text-slate-400 mt-1">Par contribution au Chiffre d'Affaires</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {data.topClients.length === 0 ? (
                                <div className="text-center py-12 flex flex-col items-center">
                                    <div className="h-16 w-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                                        <Users className="h-8 w-8 text-slate-200" />
                                    </div>
                                    <p className="text-slate-400 font-bold text-sm">Aucun historique client</p>
                                </div>
                            ) : (
                                data.topClients.map((client, i) => (
                                    <div key={client.name} className="flex items-center gap-4 p-4 rounded-lg hover:bg-slate-50/80 transition-all border border-transparent hover:border-slate-100 group/client">
                                        <div className="h-12 w-12 rounded-md bg-slate-100 font-semibold text-slate-400 flex items-center justify-center shrink-0 group-hover/client:bg-blue-600 group-hover/client:text-white transition-colors">
                                            {i + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-sm font-semibold text-slate-950 truncate">{client.name}</span>
                                                <span className="text-sm font-semibold text-slate-950">{formatCurrency(Number(client.total_sales))}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{client.orders_count} transactions</span>
                                                <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-blue-600/30 w-[60%]" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid gap-10 lg:grid-cols-2">
                    {/* Top Products */}
                    <div className="rounded-lg bg-white border border-slate-200/60 shadow-sm overflow-hidden p-8">
                        <div className="mb-8">
                            <h3 className="text-xl font-semibold text-slate-950 tracking-tight flex items-center gap-3">
                                <Package className="h-6 w-6 text-indigo-600" />
                                Top Produits du Mois
                            </h3>
                            <p className="text-sm font-medium text-slate-400 mt-1">Par chiffre d&apos;affaires</p>
                        </div>
                        <div className="space-y-3">
                            {data.topProducts.length === 0 ? (
                                <div className="text-center py-12 text-slate-400 font-bold text-sm">Aucune vente ce mois</div>
                            ) : (
                                data.topProducts.map((prod, i) => {
                                    const maxRev = Math.max(...data.topProducts.map(p => Number(p.revenue)))
                                    const pct = maxRev > 0 ? (Number(prod.revenue) / maxRev) * 100 : 0
                                    return (
                                        <div key={`${prod.product_name}-${prod.packaging_name}`} className="flex items-center gap-4 p-3 rounded-md hover:bg-slate-50 transition-colors">
                                            <span className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-400 shrink-0">{i + 1}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-sm font-semibold text-slate-950 truncate">{prod.product_name}</span>
                                                    <span className="text-sm font-semibold text-slate-950 ml-2">{formatCurrency(Number(prod.revenue))}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] font-bold text-slate-400">{prod.packaging_name} — {prod.units_sold} vendus</span>
                                                    <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-indigo-500/40 rounded-full" style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>

                    {/* Payment Methods */}
                    <div className="rounded-lg bg-white border border-slate-200/60 shadow-sm overflow-hidden p-8">
                        <div className="mb-8">
                            <h3 className="text-xl font-semibold text-slate-950 tracking-tight flex items-center gap-3">
                                <Wallet className="h-6 w-6 text-indigo-600" />
                                Répartition des Paiements
                            </h3>
                            <p className="text-sm font-medium text-slate-400 mt-1">Canaux de règlement ce mois</p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            {data.paymentMethods.length === 0 ? (
                                <div className="col-span-full text-center py-12 text-slate-400 font-bold">Données indisponibles</div>
                            ) : (
                                data.paymentMethods.map((pm) => (
                                    <div key={pm.payment_method} className="p-6 rounded-[2rem] bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-md hover:shadow-blue-500/5 transition-all">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                                            {paymentLabels[pm.payment_method] || pm.payment_method}
                                        </p>
                                        <p className="text-xl font-semibold text-slate-950 leading-none mb-2">{formatCurrency(Number(pm.total))}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{pm.count} transactions</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Daily Sales Bar Chart */}
                <div className="rounded-lg bg-white border border-slate-200/60 shadow-sm overflow-hidden p-8">
                    <div className="mb-8">
                        <h3 className="text-xl font-semibold text-slate-950 tracking-tight flex items-center gap-3">
                            <BarChart3 className="h-6 w-6 text-emerald-600" />
                            Ventes Journalières
                        </h3>
                        <p className="text-sm font-medium text-slate-400 mt-1">Évolution quotidienne du mois en cours</p>
                    </div>
                    {data.dailySales.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 font-bold text-sm">Aucune donnée ce mois</div>
                    ) : (
                        <div className="flex items-end gap-1 h-48 overflow-x-auto pb-2">
                            {data.dailySales.map((day) => {
                                const maxDay = Math.max(...data.dailySales.map(d => Number(d.total)))
                                const hPct = maxDay > 0 ? (Number(day.total) / maxDay) * 100 : 0
                                return (
                                    <div key={day.day} className="flex flex-col items-center gap-1 flex-1 min-w-[24px] group/bar">
                                        <span className="text-[9px] font-semibold text-slate-400 opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap">
                                            {formatCurrency(Number(day.total))}
                                        </span>
                                        <div
                                            className="w-full rounded-t-lg bg-emerald-500 hover:bg-emerald-400 transition-all cursor-pointer min-h-[4px]"
                                            style={{ height: `${Math.max(hPct, 3)}%` }}
                                            title={`${new Date(day.day).toLocaleDateString('fr-FR')}: ${formatCurrency(Number(day.total))} (${day.count} cmd)`}
                                        />
                                        <span className="text-[8px] font-bold text-slate-300 leading-none">
                                            {new Date(day.day).getDate()}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
