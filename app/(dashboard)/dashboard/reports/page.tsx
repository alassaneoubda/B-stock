import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageIntro, PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowDownRight, ArrowUpRight, BarChart3, Boxes, CreditCard, Package, Scale, ShoppingCart, Truck, Users, Wallet } from 'lucide-react'
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

/** « 2026-10 » → « oct. » (axe du graphique) */
function monthShort(month: string) {
    const [year, m] = month.split('-').map(Number)
    if (!year || !m) return month
    return new Date(year, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')
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

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Montant compact pour les étiquettes de graphique (« 125 k »). */
function compact(n: number) {
    if (n <= 0) return '—'
    if (n >= 1_000_000) return `${formatNumber(Math.round(n / 100_000) / 10)} M`
    return `${formatNumber(Math.round(n / 1000))} k`
}

function ChartEmpty({ icon: Icon, text }: { icon: typeof BarChart3; text: string }) {
    return (
        <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm text-muted-foreground">{text}</p>
        </div>
    )
}

export default async function ReportsPage() {
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''
    const data = await getReportData(companyId)

    // salesByMonth[0] n'est le mois en cours que s'il y a eu des ventes ce mois-ci
    const currentMonthSales = data.salesByMonth.find((m) => m.month === m.current_month)
    const salesMinusPurchases = Number(currentMonthSales?.total || 0) - data.procurementTotal
    const currentMonthTotal = Number(currentMonthSales?.total || 0)

    // Graphique mensuel : du plus ancien au plus récent
    const months = [...data.salesByMonth].reverse()
    const maxMonth = Math.max(...months.map((m) => Number(m.total)), 1)
    const sixMonthsTotal = months.reduce((sum, m) => sum + Number(m.total), 0)

    const maxDay = Math.max(...data.dailySales.map((d) => Number(d.total)), 1)
    const todayOfMonth = new Date().getDate()

    const maxClient = Number(data.topClients[0]?.total_sales || 0)
    const maxProduct = Math.max(...data.topProducts.map((p) => Number(p.revenue)), 0)
    const paymentsTotal = data.paymentMethods.reduce((sum, pm) => sum + Number(pm.total), 0)
    const currentMonthName = capitalize(new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }))

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader title="Rapports" description="Performance commerciale et santé financière" />

            <PageShell>
                <PageIntro eyebrow="Période en cours" title={currentMonthName} />

                {/* Indicateurs du mois */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        emphasis
                        label="Ventes du mois"
                        value={formatMoney(currentMonthTotal)}
                        hint={`${formatNumber(currentMonthSales?.count || 0)} commande(s) non annulée(s)`}
                        icon={ShoppingCart}
                    />
                    <StatCard
                        label="Achats du mois"
                        value={formatMoney(data.procurementTotal)}
                        hint={`${formatNumber(data.procurementCount)} commande(s) fournisseur`}
                        icon={Truck}
                    />
                    <StatCard
                        label="Ventes − achats"
                        value={formatMoney(salesMinusPurchases)}
                        hint="Écart du mois (ce n’est pas une marge comptable)"
                        icon={Scale}
                        tone={salesMinusPurchases >= 0 ? 'success' : 'danger'}
                    />
                    <StatCard
                        label="Valeur du stock"
                        value={formatMoney(data.stockValue)}
                        hint={`${formatNumber(data.stockUnits)} unités au prix de revient`}
                        icon={Boxes}
                    />
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    {/* Ventes par mois */}
                    <Panel
                        title="Ventes par mois"
                        description={`${formatMoney(sixMonthsTotal)} sur les 6 derniers mois`}
                        className="lg:col-span-2"
                        bodyClassName="px-5 pb-5 pt-6"
                    >
                        {months.length === 0 ? (
                            <ChartEmpty icon={BarChart3} text="Aucune vente sur les 6 derniers mois." />
                        ) : (
                            <div
                                className="flex h-52 items-end gap-3 sm:gap-5"
                                role="img"
                                aria-label={`Ventes par mois sur les 6 derniers mois, total ${formatMoney(sixMonthsTotal)}`}
                            >
                                {months.map((month) => {
                                    const isCurrent = month.month === month.current_month
                                    const total = Number(month.total)
                                    const height = total > 0 ? Math.max(6, (total / maxMonth) * 100) : 2
                                    return (
                                        <div key={month.month} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                                            <span className="tabular text-[11px] font-medium text-muted-foreground">{compact(total)}</span>
                                            <div
                                                className={isCurrent ? 'w-full max-w-16 rounded-md bg-brand' : 'w-full max-w-16 rounded-md bg-primary/80 transition-colors group-hover:bg-primary'}
                                                style={{ height: `${height}%` }}
                                                title={`${monthLabel(month.month)} : ${formatMoney(total)} · ${formatNumber(month.count)} commande(s)`}
                                            />
                                            <span className={isCurrent ? 'text-xs font-semibold capitalize text-foreground' : 'text-xs capitalize text-muted-foreground'}>
                                                {monthShort(month.month)}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </Panel>

                    {/* Encours */}
                    <Panel title="Encours clients" description="Montants restant à recouvrer">
                        <ul className="divide-y divide-border">
                            <li className="flex items-start gap-3 px-5 py-4">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                                    <CreditCard className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground">Créances produits</p>
                                    <p className="text-xs text-muted-foreground">Ventes non encore payées</p>
                                </div>
                                <span className="tabular text-right text-sm font-semibold text-foreground">{formatMoney(data.productDebt)}</span>
                            </li>
                            <li className="flex items-start gap-3 px-5 py-4">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning-foreground">
                                    <Package className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground">Dettes emballages</p>
                                    <p className="text-xs text-muted-foreground">Casiers et bouteilles à récupérer</p>
                                </div>
                                <span className="tabular text-right text-sm font-semibold text-foreground">{formatMoney(data.packagingDebt)}</span>
                            </li>
                        </ul>
                    </Panel>
                </div>

                {/* Détail mensuel */}
                {data.salesByMonth.length > 0 && (
                    <Panel title="Détail mensuel" description="Variation par rapport au mois précédent">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="pl-5">Mois</TableHead>
                                    <TableHead className="text-right">Commandes</TableHead>
                                    <TableHead className="text-right">Montant</TableHead>
                                    <TableHead className="pr-5 text-right">Variation</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.salesByMonth.map((month, index) => {
                                    // Variation réelle par rapport au mois précédent (liste triée du plus récent au plus ancien)
                                    const previous = data.salesByMonth[index + 1]
                                    const previousTotal = Number(previous?.total || 0)
                                    const variation = previous && previousTotal > 0
                                        ? Math.round(((Number(month.total) - previousTotal) / previousTotal) * 100)
                                        : null
                                    return (
                                        <TableRow key={month.month}>
                                            <TableCell className="pl-5 font-medium capitalize text-foreground">
                                                {monthLabel(month.month)}
                                                {month.month === month.current_month && (
                                                    <span className="ml-2 align-middle">
                                                        <StatusBadge label="En cours" tone="brand" />
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="tabular text-right text-muted-foreground">{formatNumber(month.count)}</TableCell>
                                            <TableCell className="tabular text-right font-semibold text-foreground">{formatMoney(Number(month.total))}</TableCell>
                                            <TableCell className="pr-5 text-right">
                                                {variation === null ? (
                                                    <span className="text-muted-foreground">—</span>
                                                ) : (
                                                    <span
                                                        className={`tabular inline-flex items-center gap-1 text-xs font-semibold ${variation >= 0 ? 'text-success' : 'text-destructive'}`}
                                                    >
                                                        {variation >= 0 ? (
                                                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                                                        ) : (
                                                            <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                                                        )}
                                                        {variation >= 0 ? '+' : '−'}{Math.abs(variation)} %
                                                    </span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </Panel>
                )}

                {/* Ventes journalières */}
                <Panel
                    title="Ventes journalières"
                    description="Jours avec ventes du mois en cours"
                    bodyClassName="px-5 pb-5 pt-6"
                >
                    {data.dailySales.length === 0 ? (
                        <ChartEmpty icon={BarChart3} text="Aucune vente ce mois-ci." />
                    ) : (
                        <div className="overflow-x-auto">
                            <div
                                className="flex h-48 min-w-max items-end gap-1.5 sm:min-w-0"
                                role="img"
                                aria-label={`Ventes journalières du mois en cours, ${data.dailySales.length} jour(s) avec ventes`}
                            >
                                {data.dailySales.map((day) => {
                                    const total = Number(day.total)
                                    const isToday = dayOfMonth(day.day) === todayOfMonth
                                    const hPct = total > 0 ? Math.max(4, (total / maxDay) * 100) : 2
                                    return (
                                        <div key={String(day.day)} className="group flex h-full min-w-6 flex-1 flex-col items-center justify-end gap-2">
                                            <span className="tabular whitespace-nowrap text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                                                {compact(total)}
                                            </span>
                                            <div
                                                className={isToday ? 'w-full rounded-md bg-brand' : 'w-full rounded-md bg-primary/80 transition-colors group-hover:bg-primary'}
                                                style={{ height: `${hPct}%` }}
                                                title={`${formatDate(day.day)} : ${formatMoney(day.total)} (${formatNumber(day.count)} cmd)`}
                                            />
                                            <span className={isToday ? 'tabular text-[11px] font-semibold text-foreground' : 'tabular text-[11px] text-muted-foreground'}>
                                                {dayOfMonth(day.day)}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </Panel>

                <div className="grid gap-4 lg:grid-cols-2">
                    {/* Meilleurs clients */}
                    <Panel title="Meilleurs clients" description="Par chiffre d’affaires, toutes périodes">
                        {data.topClients.length === 0 ? (
                            <ChartEmpty icon={Users} text="Aucun historique client pour l’instant." />
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-10 pl-5">#</TableHead>
                                        <TableHead>Client</TableHead>
                                        <TableHead className="text-right">Commandes</TableHead>
                                        <TableHead className="pr-5 text-right">Montant</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.topClients.map((client, i) => (
                                        <TableRow key={`${client.name}-${i}`}>
                                            <TableCell className="tabular pl-5 text-muted-foreground">{i + 1}</TableCell>
                                            <TableCell className="max-w-0 w-full">
                                                <span className="block truncate font-medium text-foreground">{client.name}</span>
                                                <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                                    <span
                                                        className="block h-full rounded-full bg-primary/70"
                                                        style={{ width: `${maxClient > 0 ? (Number(client.total_sales) / maxClient) * 100 : 0}%` }}
                                                    />
                                                </span>
                                            </TableCell>
                                            <TableCell className="tabular text-right text-muted-foreground">{formatNumber(client.orders_count)}</TableCell>
                                            <TableCell className="tabular pr-5 text-right font-semibold text-foreground">
                                                {formatMoney(Number(client.total_sales))}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </Panel>

                    {/* Produits du mois */}
                    <Panel title="Produits les plus vendus" description="Par chiffre d’affaires, mois en cours">
                        {data.topProducts.length === 0 ? (
                            <ChartEmpty icon={Package} text="Aucune vente ce mois-ci." />
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-10 pl-5">#</TableHead>
                                        <TableHead>Produit</TableHead>
                                        <TableHead className="text-right">Vendus</TableHead>
                                        <TableHead className="pr-5 text-right">Montant</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.topProducts.map((prod, i) => (
                                        <TableRow key={`${prod.product_name}-${prod.packaging_name}`}>
                                            <TableCell className="tabular pl-5 text-muted-foreground">{i + 1}</TableCell>
                                            <TableCell className="max-w-0 w-full">
                                                <span className="block truncate font-medium text-foreground">{prod.product_name}</span>
                                                <span className="block truncate text-xs text-muted-foreground">{prod.packaging_name}</span>
                                                <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                                    <span
                                                        className="block h-full rounded-full bg-primary/70"
                                                        style={{ width: `${maxProduct > 0 ? (Number(prod.revenue) / maxProduct) * 100 : 0}%` }}
                                                    />
                                                </span>
                                            </TableCell>
                                            <TableCell className="tabular text-right text-muted-foreground">{formatNumber(prod.units_sold)}</TableCell>
                                            <TableCell className="tabular pr-5 text-right font-semibold text-foreground">
                                                {formatMoney(Number(prod.revenue))}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </Panel>
                </div>

                {/* Moyens de paiement */}
                <Panel title="Moyens de paiement" description="Répartition des ventes du mois en cours">
                    {data.paymentMethods.length === 0 ? (
                        <ChartEmpty icon={Wallet} text="Aucune vente ce mois-ci." />
                    ) : (
                        <ul className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
                            {data.paymentMethods.map((pm) => {
                                const share = paymentsTotal > 0 ? Math.round((Number(pm.total) / paymentsTotal) * 100) : 0
                                return (
                                    <li key={pm.payment_method ?? 'unknown'} className="space-y-2 px-5 py-4">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className="text-sm font-medium text-foreground">
                                                {paymentLabels[pm.payment_method] || pm.payment_method || 'Non renseigné'}
                                            </span>
                                            <span className="tabular text-xs text-muted-foreground">{share} %</span>
                                        </div>
                                        <p className="tabular text-lg font-semibold tracking-tight text-foreground">{formatMoney(Number(pm.total))}</p>
                                        <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                            <div className="h-full rounded-full bg-primary/70" style={{ width: `${share}%` }} />
                                        </div>
                                        <p className="text-xs text-muted-foreground">{formatNumber(pm.count)} transaction(s)</p>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </Panel>
            </PageShell>
        </div>
    )
}
