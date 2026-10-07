import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BarChart3, TrendingUp, Users, Package, CreditCard, ShoppingCart, ArrowUpRight, ArrowDownRight, PieChart, Wallet, Boxes, Truck } from 'lucide-react'
import { formatMoney, formatNumber, formatDate } from '@/lib/format'

// Pas de try/catch : une panne SQL remonte à error.tsx au lieu d'afficher des zéros.
async function getReportData(companyId: string) {
    {
        // Sales by month (last 6 months)
        const salesByMonth = await sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        TO_CHAR(DATE_TRUNC('month', NOW()), 'YYYY-MM') as current_month,
        COALESCE(SUM(total_amount), 0) as total,
        COUNT(*) as count
      FROM sales_orders
      WHERE company_id = ${companyId}
        AND status != 'cancelled'
        AND created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
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
      HAVING COUNT(so.id) > 0
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
            salesByMonth: salesByMonth as Array<{ month: string; current_month: string; total: number; count: number }>,
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
    }
}

/** « 2026-10 » → « octobre 2026 » */
function monthLabel(month: string) {
    const [year, m] = month.split('-').map(Number)
    if (!year || !m) return month
    return new Date(year, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

/** « 2026-10-06 » (ou Date) → jour du mois, sans décalage de fuseau. */
function dayOfMonth(day: unknown) {
    if (day instanceof Date) return day.getDate()
    const n = Number(String(day).slice(8, 10))
    return Number.isFinite(n) && n > 0 ? n : '—'
}

const paymentLabels: Record<string, string> = {
    cash: 'Espèces',
    mobile_money: 'Mobile Money',
    credit: 'Crédit',
    mixed: 'Mixte',
}

export default async function ReportsPage() {
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''
    const data = await getReportData(companyId)

    // salesByMonth[0] n'est le mois en cours que s'il y a eu des ventes ce mois-ci
    const currentMonthSales = data.salesByMonth.find((m) => m.month === m.current_month)
    const salesMinusPurchases = Number(currentMonthSales?.total || 0) - data.procurementTotal

    const kpiData = [
        {
            title: "Ventes ce Mois",
            value: formatMoney(Number(currentMonthSales?.total || 0)),
            description: `${formatNumber(currentMonthSales?.count || 0)} commande(s) non annulée(s)`,
            icon: ShoppingCart,
            color: "bg-primary/10 text-brand-strong",
        },
        {
            title: "Achats ce Mois",
            value: formatMoney(data.procurementTotal),
            description: `${formatNumber(data.procurementCount)} commande(s) fournisseur`,
            icon: Truck,
            color: "bg-info/10 text-info",
        },
        {
            title: "Créances Produits",
            value: formatMoney(data.productDebt),
            description: "Encours de paiement",
            icon: CreditCard,
            color: "bg-destructive/10 text-destructive",
        },
        {
            title: "Dettes Emballages",
            value: formatMoney(data.packagingDebt),
            description: "Casiers à récupérer",
            icon: Package,
            color: "bg-warning/10 text-warning-foreground",
        },
        {
            title: "Valeur du Stock",
            value: formatMoney(data.stockValue),
            description: `${formatNumber(data.stockUnits)} unités en réserve`,
            icon: TrendingUp,
            color: "bg-success/10 text-success",
        },
        {
            title: "Ventes − Achats",
            value: formatMoney(salesMinusPurchases),
            description: "Écart du mois (ce n'est pas une marge comptable)",
            icon: Boxes,
            color: salesMinusPurchases >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
        },
    ]

    return (
        <div className="flex flex-col min-h-screen bg-muted/30">
            <DashboardHeader
                title="Intelligence & Rapports"
                description="Suivez la performance et la santé financière de votre entreprise"
            />

            <main className="flex-1 p-4 lg:p-6 space-y-6 ">
                {/* KPI Grid */}
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {kpiData.map((stat) => (
                        <div
                            key={stat.title}
                            className="relative overflow-hidden rounded-lg bg-card p-8 shadow-sm border border-border hover:border-border transition-colors"
                        >
                            <div className="relative z-10 flex flex-col gap-6">
                                <div className={`flex h-14 w-14 items-center justify-center rounded-md ${stat.color}`}>
                                    <stat.icon className="h-7 w-7" aria-hidden="true" />
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">{stat.title}</p>
                                    <div className="text-2xl font-semibold text-foreground tracking-tight">{stat.value}</div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <p className="text-sm font-bold text-muted-foreground/70">{stat.description}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid gap-10 lg:grid-cols-2">
                    {/* Monthly Sales Chart-style Breakdown */}
                    <div className="rounded-lg bg-card border border-border shadow-sm overflow-hidden p-8">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-xl font-semibold text-foreground tracking-tight flex items-center gap-3">
                                    <BarChart3 className="h-6 w-6 text-brand-strong" />
                                    Ventes par Mois
                                </h3>
                                <p className="text-sm font-medium text-muted-foreground/70 mt-1">Évolution des 6 derniers mois</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {data.salesByMonth.length === 0 ? (
                                <div className="text-center py-12 flex flex-col items-center">
                                    <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                                        <BarChart3 className="h-8 w-8 text-muted-foreground/70" />
                                    </div>
                                    <p className="text-muted-foreground font-bold text-sm">Aucune vente sur les 6 derniers mois</p>
                                </div>
                            ) : (
                                data.salesByMonth.map((month, index) => {
                                    const maxSales = Math.max(...data.salesByMonth.map(m => Number(m.total)))
                                    const pct = maxSales > 0 ? (Number(month.total) / maxSales) * 100 : 0
                                    // Variation réelle par rapport au mois précédent (liste triée du plus récent au plus ancien)
                                    const previous = data.salesByMonth[index + 1]
                                    const previousTotal = Number(previous?.total || 0)
                                    const variation = previous && previousTotal > 0
                                        ? Math.round(((Number(month.total) - previousTotal) / previousTotal) * 100)
                                        : null
                                    return (
                                        <div key={month.month} className="group/item">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{monthLabel(month.month)}</span>
                                                <span className="text-sm font-semibold text-foreground">{formatMoney(Number(month.total))}</span>
                                            </div>
                                            <div className="relative h-4 w-full bg-muted/50 rounded-full overflow-hidden border border-border">
                                                <div
                                                    className="absolute inset-y-0 left-0 bg-primary rounded-full transition-colors group-hover/item:bg-blue-500"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">{formatNumber(month.count)} commandes</span>
                                                {variation !== null && (
                                                    <div className="flex items-center gap-1" title="Variation par rapport au mois précédent">
                                                        {variation >= 0 ? (
                                                            <ArrowUpRight className="h-3 w-3 text-success" aria-hidden="true" />
                                                        ) : (
                                                            <ArrowDownRight className="h-3 w-3 text-destructive" aria-hidden="true" />
                                                        )}
                                                        <span className={`text-[10px] font-semibold ${variation >= 0 ? 'text-success' : 'text-destructive'}`}>
                                                            {variation >= 0 ? '+' : '−'}{Math.abs(variation)} % vs mois préc.
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>

                    {/* Top Clients Breakdown */}
                    <div className="rounded-lg bg-card border border-border shadow-sm overflow-hidden p-8">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-xl font-semibold text-foreground tracking-tight flex items-center gap-3">
                                    <PieChart className="h-6 w-6 text-success" />
                                    Top Clients
                                </h3>
                                <p className="text-sm font-medium text-muted-foreground/70 mt-1">Par contribution au Chiffre d'Affaires</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {data.topClients.length === 0 ? (
                                <div className="text-center py-12 flex flex-col items-center">
                                    <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                                        <Users className="h-8 w-8 text-muted-foreground/70" />
                                    </div>
                                    <p className="text-muted-foreground/70 font-bold text-sm">Aucun historique client</p>
                                </div>
                            ) : (
                                data.topClients.map((client, i) => (
                                    <div key={`${client.name}-${i}`} className="flex items-center gap-4 p-4 rounded-lg hover:bg-muted/30 transition-all border border-transparent hover:border-border group/client">
                                        <div className="h-12 w-12 rounded-md bg-muted font-semibold text-muted-foreground/70 flex items-center justify-center shrink-0 group-hover/client:bg-blue-600 group-hover/client:text-white transition-colors">
                                            {i + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-sm font-semibold text-foreground truncate">{client.name}</span>
                                                <span className="text-sm font-semibold text-foreground">{formatMoney(Number(client.total_sales))}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{formatNumber(client.orders_count)} transactions</span>
                                                <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-primary/30"
                                                        style={{ width: `${Number(data.topClients[0]?.total_sales) > 0 ? (Number(client.total_sales) / Number(data.topClients[0].total_sales)) * 100 : 0}%` }}
                                                    />
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
                    <div className="rounded-lg bg-card border border-border shadow-sm overflow-hidden p-8">
                        <div className="mb-8">
                            <h3 className="text-xl font-semibold text-foreground tracking-tight flex items-center gap-3">
                                <Package className="h-6 w-6 text-info" />
                                Top Produits du Mois
                            </h3>
                            <p className="text-sm font-medium text-muted-foreground/70 mt-1">Par chiffre d&apos;affaires</p>
                        </div>
                        <div className="space-y-3">
                            {data.topProducts.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground/70 font-bold text-sm">Aucune vente ce mois</div>
                            ) : (
                                data.topProducts.map((prod, i) => {
                                    const maxRev = Math.max(...data.topProducts.map(p => Number(p.revenue)))
                                    const pct = maxRev > 0 ? (Number(prod.revenue) / maxRev) * 100 : 0
                                    return (
                                        <div key={`${prod.product_name}-${prod.packaging_name}`} className="flex items-center gap-4 p-3 rounded-md hover:bg-muted/50 transition-colors">
                                            <span className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground/70 shrink-0">{i + 1}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-sm font-semibold text-foreground truncate">{prod.product_name}</span>
                                                    <span className="text-sm font-semibold text-foreground ml-2">{formatMoney(Number(prod.revenue))}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] font-bold text-muted-foreground">{prod.packaging_name} — {formatNumber(prod.units_sold)} vendus</span>
                                                    <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                                                        <div className="h-full bg-info/40 rounded-full" style={{ width: `${pct}%` }} />
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
                    <div className="rounded-lg bg-card border border-border shadow-sm overflow-hidden p-8">
                        <div className="mb-8">
                            <h3 className="text-xl font-semibold text-foreground tracking-tight flex items-center gap-3">
                                <Wallet className="h-6 w-6 text-info" />
                                Répartition des Paiements
                            </h3>
                            <p className="text-sm font-medium text-muted-foreground/70 mt-1">Canaux de règlement ce mois</p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            {data.paymentMethods.length === 0 ? (
                                <div className="col-span-full text-center py-12 text-muted-foreground font-bold text-sm">Aucune vente ce mois</div>
                            ) : (
                                data.paymentMethods.map((pm) => (
                                    <div key={pm.payment_method ?? 'unknown'} className="p-6 rounded-xl bg-muted/50 border border-border hover:bg-card transition-colors">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
                                            {paymentLabels[pm.payment_method] || pm.payment_method || 'Non renseigné'}
                                        </p>
                                        <p className="text-xl font-semibold text-foreground leading-none mb-2">{formatMoney(Number(pm.total))}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">{formatNumber(pm.count)} transactions</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Daily Sales Bar Chart */}
                <div className="rounded-lg bg-card border border-border shadow-sm overflow-hidden p-8">
                    <div className="mb-8">
                        <h3 className="text-xl font-semibold text-foreground tracking-tight flex items-center gap-3">
                            <BarChart3 className="h-6 w-6 text-success" />
                            Ventes Journalières
                        </h3>
                        <p className="text-sm font-medium text-muted-foreground/70 mt-1">Évolution quotidienne du mois en cours</p>
                    </div>
                    {data.dailySales.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground/70 font-bold text-sm">Aucune donnée ce mois</div>
                    ) : (
                        <div className="flex items-end gap-1 h-48 overflow-x-auto pb-2">
                            {data.dailySales.map((day) => {
                                const maxDay = Math.max(...data.dailySales.map(d => Number(d.total)))
                                const hPct = maxDay > 0 ? (Number(day.total) / maxDay) * 100 : 0
                                return (
                                    <div key={String(day.day)} className="flex flex-col items-center gap-1 flex-1 min-w-[24px] group/bar">
                                        <span className="text-[9px] font-semibold text-muted-foreground/70 opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap">
                                            {formatMoney(Number(day.total))}
                                        </span>
                                        <div
                                            className="w-full rounded-t-lg bg-success hover:bg-success transition-colors min-h-[4px]"
                                            style={{ height: `${Math.max(hPct, 3)}%` }}
                                            title={`${formatDate(day.day)} : ${formatMoney(day.total)} (${formatNumber(day.count)} cmd)`}
                                        />
                                        <span className="text-[8px] font-bold text-muted-foreground/70 leading-none">
                                            {dayOfMonth(day.day)}
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
