import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, StatCard, StatusBadge } from '@/components/app/blocks'
import { EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Plus,
    MoreHorizontal,
    ShoppingCart,
    Eye,
    FileText,
    TrendingUp,
    Banknote,
    CreditCard,
    Search,
    ChevronLeft,
    ChevronRight,
    X,
    BarChart3,
} from 'lucide-react'
import Link from 'next/link'
import { formatDateShort, formatDateTime, formatMoney } from '@/lib/format'
import { isUuid } from '@/lib/tenant'

const PAGE_SIZE = 50

interface SaleOrder {
    id: string
    order_number: string
    client_name: string
    client_id: string
    total_amount: number
    paid_amount: number
    payment_method: string | null
    status: string
    order_source: string | null
    created_at: string
}

// Pas de try/catch : une panne de base doit afficher l'écran d'erreur
// (dashboard/error.tsx) et non des KPI à zéro trompeurs.
async function getSalesStats(companyId: string) {
    const [todayStats, monthStats, pendingCredit] = await Promise.all([
        sql`
      SELECT
        COALESCE(SUM(total_amount), 0) as total,
        COALESCE(SUM(paid_amount), 0) as paid,
        COUNT(*) as count
      FROM sales_orders
      WHERE company_id = ${companyId}
        AND DATE(created_at) = CURRENT_DATE
        AND status != 'cancelled'
    `,
        sql`
      SELECT
        COALESCE(SUM(total_amount), 0) as total,
        COUNT(*) as count
      FROM sales_orders
      WHERE company_id = ${companyId}
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        AND status != 'cancelled'
    `,
        // Encours = reste dû des créances ouvertes (inclut les ventes « mixte »)
        sql`
      SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) as amount
      FROM credit_notes
      WHERE company_id = ${companyId}
        AND status IN ('pending', 'partial', 'overdue')
    `,
    ])

    return {
        todayTotal: Number(todayStats[0]?.total || 0),
        todayPaid: Number(todayStats[0]?.paid || 0),
        todayCount: Number(todayStats[0]?.count || 0),
        monthTotal: Number(monthStats[0]?.total || 0),
        monthCount: Number(monthStats[0]?.count || 0),
        pendingCredit: Number(pendingCredit[0]?.amount || 0),
    }
}

async function getSalesOrders(
    companyId: string,
    q: string | null,
    page: number,
    clientId: string | null
): Promise<{ orders: SaleOrder[]; hasMore: boolean }> {
    const search = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null
    const offset = (page - 1) * PAGE_SIZE
    const rows = await sql`
      SELECT
        so.id,
        so.order_number,
        so.total_amount,
        so.paid_amount,
        so.payment_method,
        so.status,
        so.order_source,
        so.created_at,
        c.name as client_name,
        c.id as client_id
      FROM sales_orders so
      LEFT JOIN clients c ON so.client_id = c.id
      WHERE so.company_id = ${companyId}
        AND (${search}::text IS NULL OR so.order_number ILIKE ${search}::text OR c.name ILIKE ${search}::text)
        AND (${clientId}::uuid IS NULL OR so.client_id = ${clientId}::uuid)
      ORDER BY so.created_at DESC
      LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
    `
    return {
        orders: rows.slice(0, PAGE_SIZE) as SaleOrder[],
        hasMore: rows.length > PAGE_SIZE,
    }
}


const paymentConfig: Record<string, { label: string }> = {
    cash: { label: 'Espèces' },
    mobile_money: { label: 'Mobile Money' },
    credit: { label: 'Crédit' },
    mixed: { label: 'Mixte' },
}

function pageHref(q: string | null, page: number, clientId: string | null) {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (clientId) params.set('client', clientId)
    if (page > 1) params.set('page', String(page))
    const qs = params.toString()
    return qs ? `/dashboard/sales?${qs}` : '/dashboard/sales'
}

export default async function SalesPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string | string[]; page?: string | string[]; client?: string | string[] }>
}) {
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''
    const sp = await searchParams
    const rawQ = Array.isArray(sp.q) ? sp.q[0] : sp.q
    const q = rawQ?.trim().slice(0, 100) || null
    const rawPage = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page)
    const page = Number.isInteger(rawPage) && rawPage > 1 ? rawPage : 1
    const rawClient = Array.isArray(sp.client) ? sp.client[0] : sp.client
    const clientId = isUuid(rawClient) ? rawClient : null
    const [stats, { orders, hasMore }] = await Promise.all([
        getSalesStats(companyId),
        getSalesOrders(companyId, q, page, clientId),
    ])

    const filtered = Boolean(q || clientId)

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Ventes"
                description="Historique des ventes et encaissements"
                actions={
                    <Button variant="brand" size="sm" asChild className="h-9 rounded-lg px-3">
                        <Link href="/dashboard/sales/new" aria-label="Nouvelle vente">
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">Nouvelle vente</span>
                        </Link>
                    </Button>
                }
            />

            <PageShell>
                {/* Indicateurs */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        emphasis
                        label="Ventes du jour"
                        value={formatMoney(stats.todayTotal)}
                        hint={`${stats.todayCount} vente${stats.todayCount > 1 ? 's' : ''}`}
                        icon={ShoppingCart}
                    />
                    <StatCard
                        label="Encaissé aujourd’hui"
                        value={formatMoney(stats.todayPaid)}
                        hint="Paiements reçus sur les ventes du jour"
                        icon={Banknote}
                        tone="success"
                    />
                    <StatCard
                        label="Ce mois-ci"
                        value={formatMoney(stats.monthTotal)}
                        hint={`${stats.monthCount} vente${stats.monthCount > 1 ? 's' : ''}`}
                        icon={TrendingUp}
                        tone="info"
                    />
                    <StatCard
                        label="Encours clients"
                        value={formatMoney(stats.pendingCredit)}
                        hint="Créances restant dues"
                        icon={CreditCard}
                        tone={stats.pendingCredit > 0 ? 'warning' : 'default'}
                        href="/dashboard/credits"
                    />
                </div>

                {/* Barre d'outils */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                        <form action="/dashboard/sales" method="get" role="search" className="relative w-full sm:max-w-sm">
                            {clientId && <input type="hidden" name="client" value={clientId} />}
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                            <Input
                                type="search"
                                name="q"
                                defaultValue={q ?? ''}
                                placeholder="N° de vente ou client…"
                                aria-label="Rechercher une vente par numéro ou client"
                                className="h-10 rounded-lg bg-card pl-9"
                            />
                        </form>
                        {clientId && (
                            <Button variant="outline" size="sm" className="h-10 rounded-lg" asChild>
                                <Link href={pageHref(q, 1, null)}>
                                    <X className="h-4 w-4" aria-hidden="true" />
                                    Retirer le filtre client
                                </Link>
                            </Button>
                        )}
                    </div>
                    <Button variant="ghost" size="sm" className="h-10 rounded-lg text-muted-foreground" asChild>
                        <Link href="/dashboard/reports">
                            <BarChart3 className="h-4 w-4" aria-hidden="true" />
                            Rapports
                        </Link>
                    </Button>
                </div>

                {orders.length === 0 && (filtered || page > 1) ? (
                    <EmptyState
                        icon={Search}
                        title="Aucune vente trouvée"
                        description={q ? `Aucun résultat pour « ${q} ».` : clientId ? 'Aucune vente pour ce client.' : 'Cette page est vide.'}
                        action={{ label: 'Voir toutes les ventes', href: '/dashboard/sales' }}
                        className="bg-card"
                    />
                ) : orders.length === 0 ? (
                    <EmptyState
                        icon={ShoppingCart}
                        title="Aucune vente pour le moment"
                        description="Enregistrez une première vente pour voir votre historique ici."
                        action={{ label: 'Nouvelle vente', href: '/dashboard/sales/new' }}
                        className="bg-card"
                    />
                ) : (
                    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
                        <div className="border-b border-border px-5 py-3.5">
                            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Historique des ventes</h2>
                            <p className="text-xs text-muted-foreground">
                                {filtered ? 'Résultats filtrés' : 'Les plus récentes en premier'}
                            </p>
                        </div>

                        {/* Tableau (écran large) */}
                        <div className="hidden md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="pl-5">Référence</TableHead>
                                        <TableHead>Client</TableHead>
                                        <TableHead>Paiement</TableHead>
                                        <TableHead className="text-right">Montant</TableHead>
                                        <TableHead className="text-right">Reste dû</TableHead>
                                        <TableHead>Statut</TableHead>
                                        <TableHead className="w-12 pr-5"><span className="sr-only">Actions</span></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {orders.map((order) => {
                                        const remaining = Number(order.total_amount) - Number(order.paid_amount)
                                        const payment = paymentConfig[order.payment_method ?? ''] || { label: order.payment_method || '—' }

                                        return (
                                            <TableRow key={order.id} className="relative cursor-pointer">
                                                <TableCell className="pl-5">
                                                    {/* Lien étendu : toute la ligne mène au détail */}
                                                    <Link
                                                        href={`/dashboard/sales/${order.id}`}
                                                        className="font-mono text-sm font-medium text-foreground outline-none after:absolute after:inset-0 focus-visible:underline"
                                                    >
                                                        {order.order_number}
                                                    </Link>
                                                    <p className="tabular text-xs text-muted-foreground">{formatDateShort(order.created_at)}</p>
                                                </TableCell>
                                                <TableCell>
                                                    {order.client_id ? (
                                                        <Link
                                                            href={`/dashboard/clients/${order.client_id}`}
                                                            className="relative z-10 text-sm text-foreground transition-colors hover:text-brand-strong hover:underline"
                                                        >
                                                            {order.client_name || 'Client passager'}
                                                        </Link>
                                                    ) : (
                                                        <span className="text-sm text-muted-foreground">Client passager</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-sm text-muted-foreground">{payment.label}</span>
                                                </TableCell>
                                                <TableCell className="tabular text-right font-semibold text-foreground">
                                                    {formatMoney(Number(order.total_amount))}
                                                </TableCell>
                                                <TableCell className="tabular text-right">
                                                    {remaining > 0 ? (
                                                        <span className="font-medium text-destructive">{formatMoney(remaining)}</span>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">Soldé</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <StatusBadge status={order.status} />
                                                </TableCell>
                                                <TableCell className="pr-5 text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-sm"
                                                                className="relative z-10 rounded-lg text-muted-foreground hover:text-foreground"
                                                                aria-label={`Actions pour la vente ${order.order_number}`}
                                                            >
                                                                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-48">
                                                            <DropdownMenuItem asChild>
                                                                <Link href={`/dashboard/sales/${order.id}`}>
                                                                    <Eye aria-hidden="true" />
                                                                    Voir le détail
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem asChild>
                                                                <Link href={`/dashboard/invoices/${order.id}`}>
                                                                    <FileText aria-hidden="true" />
                                                                    Facture
                                                                </Link>
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Liste (mobile) */}
                        <ul className="divide-y divide-border md:hidden">
                            {orders.map((order) => {
                                const remaining = Number(order.total_amount) - Number(order.paid_amount)
                                const payment = paymentConfig[order.payment_method ?? ''] || { label: order.payment_method || '—' }

                                return (
                                    <li key={order.id}>
                                        <Link
                                            href={`/dashboard/sales/${order.id}`}
                                            className="flex items-start justify-between gap-3 px-4 py-3.5 transition-colors active:bg-muted/60"
                                        >
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <p className="truncate text-sm font-medium text-foreground">
                                                    {order.client_name || 'Client passager'}
                                                </p>
                                                <p className="truncate text-xs text-muted-foreground">
                                                    <span className="font-mono">{order.order_number}</span> · {formatDateTime(order.created_at)} · {payment.label}
                                                </p>
                                                <StatusBadge status={order.status} />
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="tabular text-sm font-semibold text-foreground">{formatMoney(Number(order.total_amount))}</p>
                                                {remaining > 0 && (
                                                    <p className="tabular text-xs font-medium text-destructive">Reste {formatMoney(remaining)}</p>
                                                )}
                                            </div>
                                        </Link>
                                    </li>
                                )
                            })}
                        </ul>

                        {(page > 1 || hasMore) && (
                            <nav className="flex items-center justify-between gap-2 border-t border-border px-5 py-3" aria-label="Pagination des ventes">
                                <span className="tabular text-xs text-muted-foreground">Page {page}</span>
                                <div className="flex items-center gap-2">
                                    {page > 1 ? (
                                        <Button variant="outline" size="sm" className="h-9 rounded-lg" asChild>
                                            <Link href={pageHref(q, page - 1, clientId)}>
                                                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                                                Précédent
                                            </Link>
                                        </Button>
                                    ) : null}
                                    {hasMore ? (
                                        <Button variant="outline" size="sm" className="h-9 rounded-lg" asChild>
                                            <Link href={pageHref(q, page + 1, clientId)}>
                                                Suivant
                                                <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                            </Link>
                                        </Button>
                                    ) : null}
                                </div>
                            </nav>
                        )}
                    </section>
                )}
            </PageShell>
        </div>
    )
}
