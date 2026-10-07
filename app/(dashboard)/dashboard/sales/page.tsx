import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: 'En attente', variant: 'secondary' },
    confirmed: { label: 'Confirmée', variant: 'default' },
    preparing: { label: 'En préparation', variant: 'outline' },
    ready: { label: 'Prête', variant: 'default' },
    delivered: { label: 'Livrée', variant: 'default' },
    cancelled: { label: 'Annulée', variant: 'destructive' },
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

    const statCards = [
        {
            title: "Ventes aujourd'hui",
            value: formatMoney(stats.todayTotal),
            description: `${stats.todayCount} commande${stats.todayCount > 1 ? 's' : ''}`,
            icon: ShoppingCart,
            color: 'bg-primary/10 text-brand-strong',
        },
        {
            title: 'Encaissé aujourd\'hui',
            value: formatMoney(stats.todayPaid),
            description: 'Flux de trésorerie',
            icon: Banknote,
            color: 'bg-success/10 text-success',
        },
        {
            title: 'Performance mensuelle',
            value: formatMoney(stats.monthTotal),
            description: `${stats.monthCount} commandes`,
            icon: TrendingUp,
            color: 'bg-info/10 text-info',
        },
        {
            title: 'Encours clients',
            value: formatMoney(stats.pendingCredit),
            description: 'Créances clients restant dues',
            icon: CreditCard,
            color: 'bg-destructive/10 text-destructive',
        },
    ]

    return (
        <div className="flex flex-col min-h-screen bg-muted/30">
            <DashboardHeader
                title="Ventes"
                actions={
                    <Button size="sm" asChild className="h-8 px-3 text-xs font-medium">
                        <Link href="/dashboard/sales/new" className="flex items-center gap-1.5">
                            <Plus className="h-3.5 w-3.5" />
                            Nouvelle vente
                        </Link>
                    </Button>
                }
            />

            <main className="flex-1 p-4 lg:p-6 space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {statCards.map((stat) => (
                        <div key={stat.title} className="bg-card rounded-lg border border-border p-4">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-muted-foreground">{stat.title}</span>
                                <stat.icon className="h-3.5 w-3.5 text-muted-foreground/70" />
                            </div>
                            <p className="text-xl font-bold text-foreground tracking-tight">{stat.value}</p>
                            <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
                        </div>
                    ))}
                </div>

                {/* Orders Table */}
                <div className="bg-card rounded-lg border border-border overflow-hidden">
                    <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-foreground">Historique des ventes</h3>
                        <div className="flex items-center gap-2">
                            {clientId && (
                                <Button variant="outline" size="sm" className="h-9 text-xs" asChild>
                                    <Link href={pageHref(q, 1, null)}>Client filtré — tout afficher</Link>
                                </Button>
                            )}
                            <form action="/dashboard/sales" method="get" role="search" className="relative">
                                {clientId && <input type="hidden" name="client" value={clientId} />}
                                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" aria-hidden="true" />
                                <Input
                                    type="search"
                                    name="q"
                                    defaultValue={q ?? ''}
                                    placeholder="N° de vente ou client…"
                                    aria-label="Rechercher une vente par numéro ou client"
                                    className="h-9 w-56 pl-8 text-sm"
                                />
                            </form>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" asChild>
                                <Link href="/dashboard/reports">Voir les rapports</Link>
                            </Button>
                        </div>
                    </div>

                    {orders.length === 0 && (q || page > 1 || clientId) ? (
                        <div className="text-center py-16 px-4">
                            <p className="text-sm font-semibold text-foreground">Aucune vente trouvée</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {q ? `Aucun résultat pour « ${q} ».` : clientId ? 'Aucune vente pour ce client.' : 'Cette page est vide.'}
                            </p>
                            <Button size="sm" variant="outline" className="mt-4" asChild>
                                <Link href="/dashboard/sales">Voir toutes les ventes</Link>
                            </Button>
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="text-center py-16 flex flex-col items-center px-4">
                            <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center mb-4">
                                <ShoppingCart className="h-6 w-6 text-muted-foreground/70" />
                            </div>
                            <h3 className="text-sm font-semibold text-foreground">Aucune commande</h3>
                            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
                                Enregistrez des ventes pour voir votre historique ici.
                            </p>
                            <Button size="sm" className="mt-4 h-11 px-6" asChild>
                                <Link href="/dashboard/sales/new">
                                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                                    Créer une vente
                                </Link>
                            </Button>
                        </div>
                    ) : (
                        <>
                            {/* Desktop table */}
                            <div className="hidden md:block overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="text-xs font-medium text-muted-foreground pl-4">Référence</TableHead>
                                            <TableHead className="text-xs font-medium text-muted-foreground">Client</TableHead>
                                            <TableHead className="text-xs font-medium text-muted-foreground">Paiement</TableHead>
                                            <TableHead className="text-xs font-medium text-muted-foreground text-right">Montant</TableHead>
                                            <TableHead className="text-xs font-medium text-muted-foreground text-right">Reste</TableHead>
                                            <TableHead className="text-xs font-medium text-muted-foreground">Statut</TableHead>
                                            <TableHead className="pr-4"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {orders.map((order) => {
                                            const remaining = Number(order.total_amount) - Number(order.paid_amount)
                                            const status = statusConfig[order.status] || { label: order.status, variant: 'secondary' as const }
                                            const payment = paymentConfig[order.payment_method ?? ''] || { label: order.payment_method || '-' }

                                            return (
                                                <TableRow key={order.id} className="group">
                                                    <TableCell className="pl-4">
                                                        <div>
                                                            <span className="text-sm font-medium text-foreground font-mono">{order.order_number}</span>
                                                            <p className="text-xs text-muted-foreground/70">
                                                                {formatDateShort(order.created_at)}
                                                            </p>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Link
                                                            href={`/dashboard/clients/${order.client_id}`}
                                                            className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
                                                        >
                                                            {order.client_name || 'Client passager'}
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                                            {payment.label}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <span className="text-sm font-semibold text-foreground">
                                                            {formatMoney(Number(order.total_amount))}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {remaining > 0 ? (
                                                            <span className="text-sm font-medium text-destructive">{formatMoney(remaining)}</span>
                                                        ) : (
                                                            <span className="text-xs font-medium text-success">Soldé</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant={status.variant}
                                                            className={`text-[10px] font-medium ${status.variant === 'secondary' ? 'bg-muted text-muted-foreground' :
                                                                status.variant === 'destructive' ? 'bg-destructive/10 text-destructive' :
                                                                    'bg-brand-soft text-brand-strong'
                                                                } border-none`}
                                                        >
                                                            {status.label}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="pr-4 text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md" aria-label={`Actions pour la vente ${order.order_number}`}>
                                                                    <MoreHorizontal className="h-4 w-4 text-muted-foreground/70" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-48">
                                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                                    <Link href={`/dashboard/sales/${order.id}`} className="flex items-center gap-2">
                                                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                                                        <span className="text-sm">Voir le détail</span>
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                                    <Link href={`/dashboard/invoices/${order.id}`} className="flex items-center gap-2">
                                                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                                                        <span className="text-sm">Facture</span>
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

                            {/* Mobile cards */}
                            <div className="md:hidden divide-y divide-border">
                                {orders.map((order) => {
                                    const remaining = Number(order.total_amount) - Number(order.paid_amount)
                                    const status = statusConfig[order.status] || { label: order.status, variant: 'secondary' as const }
                                    const payment = paymentConfig[order.payment_method ?? ''] || { label: order.payment_method || '-' }

                                    return (
                                        <Link
                                            key={order.id}
                                            href={`/dashboard/sales/${order.id}`}
                                            className="block p-4 active:bg-muted/50 transition-colors"
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-foreground truncate">
                                                        {order.client_name || 'Client passager'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground/70 font-mono">
                                                        {order.order_number} · {formatDateTime(order.created_at)}
                                                    </p>
                                                </div>
                                                <Badge
                                                    variant={status.variant}
                                                    className={`text-[10px] font-medium ml-2 shrink-0 ${status.variant === 'secondary' ? 'bg-muted text-muted-foreground' :
                                                        status.variant === 'destructive' ? 'bg-destructive/10 text-destructive' :
                                                            'bg-brand-soft text-brand-strong'
                                                        } border-none`}
                                                >
                                                    {status.label}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                                        {payment.label}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-foreground">{formatMoney(Number(order.total_amount))}</p>
                                                    {remaining > 0 && (
                                                        <p className="text-xs font-medium text-destructive">Reste: {formatMoney(remaining)}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </Link>
                                    )
                                })}
                            </div>
                        </>
                    )}

                    {(page > 1 || hasMore) && (
                        <nav className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border" aria-label="Pagination des ventes">
                            <span className="text-xs text-muted-foreground">Page {page}</span>
                            <div className="flex items-center gap-2">
                                {page > 1 ? (
                                    <Button variant="outline" size="sm" className="h-9" asChild>
                                        <Link href={pageHref(q, page - 1, clientId)}>
                                            <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
                                            Précédent
                                        </Link>
                                    </Button>
                                ) : null}
                                {hasMore ? (
                                    <Button variant="outline" size="sm" className="h-9" asChild>
                                        <Link href={pageHref(q, page + 1, clientId)}>
                                            Suivant
                                            <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
                                        </Link>
                                    </Button>
                                ) : null}
                            </div>
                        </nav>
                    )}
                </div>
            </main>
        </div>
    )
}
