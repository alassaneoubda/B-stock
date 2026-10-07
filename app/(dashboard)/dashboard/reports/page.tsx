import Link from 'next/link'
import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageIntro, PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BarChart3, Boxes, CircleAlert, CreditCard, Package, Percent, Receipt, ShoppingCart, Users, Wallet, Warehouse } from 'lucide-react'
import { formatMoney, formatNumber, formatDate } from '@/lib/format'
import {
    defaultPeriod,
    getMarginReport,
    getStockValuation,
    isIsoDate,
    todayIso,
    type MarginGroup,
} from '@/lib/domain/costing'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function param(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
    const v = sp[key]
    return typeof v === 'string' && v ? v : undefined
}

/** Filtres de la page, validés (valeur par défaut si absente ou invalide). */
function readFilters(sp: Record<string, string | string[] | undefined>, depotIds: Set<string>) {
    const period = defaultPeriod()
    const today = todayIso()
    let from = param(sp, 'from')
    let to = param(sp, 'to')
    if (!isIsoDate(from)) from = period.from
    if (!isIsoDate(to)) to = period.to
    if (from > to) [from, to] = [to, from]
    const depot = param(sp, 'depot')
    const depotId = depot && UUID_RE.test(depot) && depotIds.has(depot) ? depot : null
    const atRaw = param(sp, 'at')
    const at = isIsoDate(atRaw) && atRaw < today ? atRaw : null
    return { from, to, depotId, at }
}

// Pas de try/catch : une panne SQL remonte à error.tsx au lieu d'afficher des zéros.
async function getSideData(companyId: string, from: string, to: string, depotId: string | null) {
    const [salesByMonth, creditStats, paymentMethods] = await Promise.all([
        sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        TO_CHAR(DATE_TRUNC('month', NOW()), 'YYYY-MM') as current_month,
        COALESCE(SUM(total_amount), 0) as total,
        COUNT(*) as count
      FROM sales_orders
      WHERE company_id = ${companyId}
        AND status != 'cancelled'
        AND created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
        AND (${depotId}::uuid IS NULL OR depot_id = ${depotId}::uuid)
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month ASC
    `,
        sql`
      SELECT
        COALESCE(SUM(CASE WHEN ca.account_type = 'product' AND ca.balance < 0 THEN ABS(ca.balance) ELSE 0 END), 0) as product_debt,
        COALESCE(SUM(CASE WHEN ca.account_type = 'packaging' AND ca.balance < 0 THEN ABS(ca.balance) ELSE 0 END), 0) as packaging_debt
      FROM client_accounts ca
      JOIN clients c ON ca.client_id = c.id
      WHERE c.company_id = ${companyId}
    `,
        sql`
      SELECT payment_method, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
      FROM sales_orders
      WHERE company_id = ${companyId}
        AND status != 'cancelled'
        AND created_at >= ${from}::date AND created_at < ${to}::date + 1
        AND (${depotId}::uuid IS NULL OR depot_id = ${depotId}::uuid)
      GROUP BY payment_method
      ORDER BY total DESC
    `,
    ])
    return {
        salesByMonth: salesByMonth as Array<{ month: string; current_month: string; total: number; count: number }>,
        productDebt: Number(creditStats[0]?.product_debt || 0),
        packagingDebt: Number(creditStats[0]?.packaging_debt || 0),
        paymentMethods: paymentMethods as Array<{ payment_method: string; count: number; total: number }>,
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

const paymentLabels: Record<string, string> = {
    cash: 'Espèces',
    mobile_money: 'Mobile Money',
    credit: 'Crédit',
    mixed: 'Mixte',
}

/** Montant compact pour les étiquettes de graphique (« 125 k »). */
function compact(n: number) {
    if (n <= 0) return '—'
    if (n >= 1_000_000) return `${formatNumber(Math.round(n / 100_000) / 10)} M`
    return `${formatNumber(Math.round(n / 1000))} k`
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function formatRate(rate: number | null) {
    return rate === null ? '—' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(rate)} %`
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

/** Tableau de marge (CA, coût des ventes, marge, taux) pour un axe d'analyse. */
function MarginTable({
    rows,
    firstColumn,
    limit = 10,
    labelOf,
    emptyIcon,
}: {
    rows: MarginGroup[]
    firstColumn: string
    limit?: number
    labelOf?: (row: MarginGroup) => string
    emptyIcon: typeof BarChart3
}) {
    if (rows.length === 0) return <ChartEmpty icon={emptyIcon} text="Aucune vente sur la période." />
    const shown = rows.slice(0, limit)
    return (
        <Table>
            <TableHeader>
                <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">{firstColumn}</TableHead>
                    <TableHead className="text-right">CA net</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Coût des ventes</TableHead>
                    <TableHead className="text-right">Marge</TableHead>
                    <TableHead className="pr-5 text-right">Taux</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {shown.map((row) => (
                    <TableRow key={row.key}>
                        <TableCell className="max-w-0 w-full pl-5">
                            <span className="block truncate font-medium text-foreground">
                                {labelOf ? labelOf(row) : row.label}
                            </span>
                            {row.sublabel && <span className="block truncate text-xs text-muted-foreground">{row.sublabel}</span>}
                        </TableCell>
                        <TableCell className="tabular whitespace-nowrap text-right text-muted-foreground">{formatMoney(row.revenue)}</TableCell>
                        <TableCell className="tabular hidden whitespace-nowrap text-right text-muted-foreground sm:table-cell">
                            {formatMoney(row.cost)}
                        </TableCell>
                        <TableCell
                            className={`tabular whitespace-nowrap text-right font-semibold ${row.margin < 0 ? 'text-destructive' : 'text-foreground'}`}
                        >
                            {formatMoney(row.margin)}
                        </TableCell>
                        <TableCell className="tabular whitespace-nowrap pr-5 text-right text-muted-foreground">{formatRate(row.rate)}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}

const selectClass =
    'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''

    const depots = (await sql`
      SELECT id, name FROM depots WHERE company_id = ${companyId} ORDER BY is_main DESC, name
    `) as Array<{ id: string; name: string }>
    const { from, to, depotId, at } = readFilters(await searchParams, new Set(depots.map((d) => d.id)))

    const [margin, stock, side] = await Promise.all([
        getMarginReport(companyId, { from, to, depotId }),
        getStockValuation(companyId, { at, depotId }),
        getSideData(companyId, from, to, depotId),
    ])

    const t = margin.totals
    const depotName = depotId ? depots.find((d) => d.id === depotId)?.name : null
    const periodTitle = from === to ? formatDate(from) : `Du ${formatDate(from)} au ${formatDate(to)}`

    const months = side.salesByMonth
    const maxMonth = Math.max(...months.map((m) => Number(m.total)), 1)
    const sixMonthsTotal = months.reduce((sum, m) => sum + Number(m.total), 0)
    const paymentsTotal = side.paymentMethods.reduce((sum, pm) => sum + Number(pm.total), 0)

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader title="Rapports" description="Chiffre d’affaires, marge brute et valeur du stock" />

            <PageShell>
                <PageIntro
                    eyebrow={depotName ? `Période · ${depotName}` : 'Période · tous les dépôts'}
                    title={periodTitle}
                    description="Marge brute réelle : chaque vente porte le coût moyen pondéré du stock au moment de la vente. Un changement de prix fournisseur ne modifie pas les marges passées."
                />

                {/* Filtres (formulaire GET : l'URL est partageable) */}
                <form method="get" className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
                    <div className="space-y-1.5">
                        <Label htmlFor="from">Du</Label>
                        <Input id="from" name="from" type="date" defaultValue={from} max={todayIso()} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="to">Au</Label>
                        <Input id="to" name="to" type="date" defaultValue={to} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="depot">Dépôt</Label>
                        <select id="depot" name="depot" defaultValue={depotId ?? ''} className={selectClass}>
                            <option value="">Tous les dépôts</option>
                            {depots.map((d) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="at">Valeur du stock au</Label>
                        <Input id="at" name="at" type="date" defaultValue={at ?? ''} max={todayIso()} aria-describedby="at-hint" />
                        <span id="at-hint" className="sr-only">Laissez vide pour la valeur actuelle</span>
                    </div>
                    <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
                        <Button type="submit" variant="brand" className="flex-1 lg:flex-none">Appliquer</Button>
                        <Button asChild variant="outline">
                            <Link href="/dashboard/reports">Réinitialiser</Link>
                        </Button>
                    </div>
                </form>

                {/* Indicateurs */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        emphasis
                        label="Chiffre d’affaires net"
                        value={formatMoney(t.revenue)}
                        hint={`${formatNumber(t.quantity)} unité(s) vendue(s), retours déduits`}
                        icon={ShoppingCart}
                    />
                    <StatCard
                        label="Coût des ventes"
                        value={formatMoney(t.cost)}
                        hint="Au coût moyen pondéré figé à la vente"
                        icon={Receipt}
                    />
                    <StatCard
                        label="Marge brute"
                        value={formatMoney(t.margin)}
                        hint={`Taux de marge : ${formatRate(t.rate)} du CA`}
                        icon={Percent}
                        tone={t.margin >= 0 ? 'success' : 'danger'}
                    />
                    <StatCard
                        label={at ? `Valeur du stock au ${formatDate(at)}` : 'Valeur du stock'}
                        value={formatMoney(stock.totalValue)}
                        hint={`${formatNumber(stock.totalQuantity)} unité(s) au coût moyen pondéré`}
                        icon={Boxes}
                    />
                </div>

                {t.missingCost > 0 && (
                    <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
                        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        {formatNumber(t.missingCost)} ligne(s) de vente sans coût de revient connu (produit sans prix d’achat) :
                        elles sont comptées à coût nul, la marge est donc surestimée d’autant.
                    </p>
                )}

                {/* Marge par mois */}
                <Panel title="Marge par mois" description="Sur la période sélectionnée">
                    <MarginTable
                        rows={margin.byMonth}
                        firstColumn="Mois"
                        limit={24}
                        labelOf={(row) => capitalize(monthLabel(row.label))}
                        emptyIcon={BarChart3}
                    />
                </Panel>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Panel title="Marge par produit" description="Les 10 meilleures marges de la période">
                        <MarginTable rows={margin.byProduct} firstColumn="Produit" emptyIcon={Package} />
                    </Panel>
                    <Panel title="Marge par client" description="Les 10 meilleures marges de la période">
                        <MarginTable rows={margin.byClient} firstColumn="Client" emptyIcon={Users} />
                    </Panel>
                    <Panel title="Marge par commercial" description="Ventes rattachées à un commercial">
                        <MarginTable rows={margin.byAgent} firstColumn="Commercial" emptyIcon={Users} />
                    </Panel>
                    <Panel title="Marge par dépôt" description="Dépôt de sortie de la marchandise">
                        <MarginTable rows={margin.byDepot} firstColumn="Dépôt" emptyIcon={Warehouse} />
                    </Panel>
                </div>

                {/* Valeur du stock */}
                <Panel
                    title={at ? `Valeur du stock au ${formatDate(at)} (fin de journée)` : 'Valeur du stock actuelle'}
                    description={
                        at
                            ? 'Reconstituée à partir des mouvements de stock et de leurs coûts figés'
                            : 'Quantités en stock × coût moyen pondéré de chaque dépôt'
                    }
                >
                    {stock.lines.length === 0 ? (
                        <ChartEmpty icon={Boxes} text={at ? 'Aucun stock à cette date.' : 'Aucun stock.'} />
                    ) : (
                        <>
                            {stock.byDepot.length > 1 && (
                                <ul className="grid divide-y divide-border border-b border-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
                                    {stock.byDepot.map((d) => (
                                        <li key={d.depotId} className="space-y-1 px-5 py-4">
                                            <p className="text-sm font-medium text-foreground">{d.depotName}</p>
                                            <p className="tabular text-lg font-semibold tracking-tight text-foreground">{formatMoney(d.value)}</p>
                                            <p className="text-xs text-muted-foreground">{formatNumber(d.quantity)} unité(s)</p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="pl-5">Produit</TableHead>
                                        {stock.byDepot.length > 1 && <TableHead className="hidden md:table-cell">Dépôt</TableHead>}
                                        <TableHead className="text-right">Quantité</TableHead>
                                        <TableHead className="hidden text-right sm:table-cell">Coût moyen</TableHead>
                                        <TableHead className="pr-5 text-right">Valeur</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {stock.lines.slice(0, 15).map((l) => (
                                        <TableRow key={`${l.depotId}-${l.variantId}`}>
                                            <TableCell className="max-w-0 w-full pl-5">
                                                <span className="block truncate font-medium text-foreground">{l.productName}</span>
                                                {l.packagingName && <span className="block truncate text-xs text-muted-foreground">{l.packagingName}</span>}
                                            </TableCell>
                                            {stock.byDepot.length > 1 && (
                                                <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{l.depotName}</TableCell>
                                            )}
                                            <TableCell className="tabular text-right text-muted-foreground">{formatNumber(l.quantity)}</TableCell>
                                            <TableCell className="tabular hidden whitespace-nowrap text-right text-muted-foreground sm:table-cell">
                                                {l.unitCost === null ? '—' : formatMoney(l.unitCost)}
                                            </TableCell>
                                            <TableCell className="tabular whitespace-nowrap pr-5 text-right font-semibold text-foreground">
                                                {formatMoney(l.value)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            {stock.lines.length > 15 && (
                                <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
                                    15 premières lignes sur {formatNumber(stock.lines.length)} (par valeur décroissante) — le total couvre tout le stock.
                                </p>
                            )}
                        </>
                    )}
                </Panel>

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
                    <Panel title="Encours clients" description="Montants restant à recouvrer, à ce jour">
                        <ul className="divide-y divide-border">
                            <li className="flex items-start gap-3 px-5 py-4">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                                    <CreditCard className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground">Créances produits</p>
                                    <p className="text-xs text-muted-foreground">Ventes non encore payées</p>
                                </div>
                                <span className="tabular text-right text-sm font-semibold text-foreground">{formatMoney(side.productDebt)}</span>
                            </li>
                            <li className="flex items-start gap-3 px-5 py-4">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning-foreground">
                                    <Package className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground">Dettes emballages</p>
                                    <p className="text-xs text-muted-foreground">Casiers et bouteilles à récupérer</p>
                                </div>
                                <span className="tabular text-right text-sm font-semibold text-foreground">{formatMoney(side.packagingDebt)}</span>
                            </li>
                        </ul>
                    </Panel>
                </div>

                {/* Moyens de paiement */}
                <Panel title="Moyens de paiement" description="Répartition des ventes de la période (montants facturés)">
                    {side.paymentMethods.length === 0 ? (
                        <ChartEmpty icon={Wallet} text="Aucune vente sur la période." />
                    ) : (
                        <ul className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
                            {side.paymentMethods.map((pm) => {
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

                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <StatusBadge label="Méthode" tone="info" />
                    <span>
                        Coût moyen pondéré par dépôt : recalculé à chaque réception, transfert entrant ou retour ; les sorties partent au coût moyen du moment.
                        Les ventes antérieures à la mise en place de ce calcul sont valorisées au prix d’achat de la fiche produit.
                    </span>
                </p>
            </PageShell>
        </div>
    )
}
