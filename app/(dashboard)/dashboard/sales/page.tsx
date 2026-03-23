import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
    Clock,
} from 'lucide-react'
import Link from 'next/link'

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

async function getSalesStats(companyId: string) {
    try {
        const todayStats = await sql`
      SELECT 
        COALESCE(SUM(total_amount), 0) as total,
        COALESCE(SUM(paid_amount), 0) as paid,
        COUNT(*) as count
      FROM sales_orders
      WHERE company_id = ${companyId}
        AND DATE(created_at) = CURRENT_DATE
        AND status != 'cancelled'
    `

        const monthStats = await sql`
      SELECT 
        COALESCE(SUM(total_amount), 0) as total,
        COUNT(*) as count
      FROM sales_orders
      WHERE company_id = ${companyId}
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        AND status != 'cancelled'
    `

        const pendingCredit = await sql`
      SELECT COALESCE(SUM(total_amount - paid_amount), 0) as amount
      FROM sales_orders
      WHERE company_id = ${companyId}
        AND payment_method = 'credit'
        AND status != 'cancelled'
        AND total_amount > paid_amount
    `

        return {
            todayTotal: Number(todayStats[0]?.total || 0),
            todayPaid: Number(todayStats[0]?.paid || 0),
            todayCount: Number(todayStats[0]?.count || 0),
            monthTotal: Number(monthStats[0]?.total || 0),
            monthCount: Number(monthStats[0]?.count || 0),
            pendingCredit: Number(pendingCredit[0]?.amount || 0),
        }
    } catch {
        return { todayTotal: 0, todayPaid: 0, todayCount: 0, monthTotal: 0, monthCount: 0, pendingCredit: 0 }
    }
}

async function getSalesOrders(companyId: string): Promise<SaleOrder[]> {
    try {
        const orders = await sql`
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
      ORDER BY so.created_at DESC
      LIMIT 100
    `
        return orders as SaleOrder[]
    } catch {
        return []
    }
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'XOF',
        minimumFractionDigits: 0,
    }).format(amount)
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

export default async function SalesPage() {
    const session = await auth()
    const companyId = session?.user?.companyId || ''
    const [stats, orders] = await Promise.all([
        getSalesStats(companyId),
        getSalesOrders(companyId),
    ])

    const statCards = [
        {
            title: "Ventes aujourd'hui",
            value: formatCurrency(stats.todayTotal),
            description: `${stats.todayCount} commande${stats.todayCount > 1 ? 's' : ''}`,
            icon: ShoppingCart,
            color: 'bg-blue-500/10 text-blue-600',
            trend: '+12.5%'
        },
        {
            title: 'Encaissé aujourd\'hui',
            value: formatCurrency(stats.todayPaid),
            description: 'Flux de trésorerie',
            icon: Banknote,
            color: 'bg-emerald-500/10 text-emerald-600',
            trend: '+8.2%'
        },
        {
            title: 'Performance mensuelle',
            value: formatCurrency(stats.monthTotal),
            description: `${stats.monthCount} commandes`,
            icon: TrendingUp,
            color: 'bg-indigo-500/10 text-indigo-600',
            trend: '+24%'
        },
        {
            title: 'Encours clients',
            value: formatCurrency(stats.pendingCredit),
            description: 'Ventes à crédit',
            icon: CreditCard,
            color: 'bg-rose-500/10 text-rose-600',
            trend: '-5.1%'
        },
    ]

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
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
                        <div key={stat.title} className="bg-white rounded-lg border border-zinc-200/80 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-zinc-500">{stat.title}</span>
                                <stat.icon className="h-3.5 w-3.5 text-zinc-400" />
                            </div>
                            <p className="text-xl font-bold text-zinc-950 tracking-tight">{stat.value}</p>
                            <p className="text-xs text-zinc-500 mt-1">{stat.description}</p>
                        </div>
                    ))}
                </div>

                {/* Orders Table */}
                <div className="bg-white rounded-lg border border-zinc-200/80 overflow-hidden">
                    <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-zinc-950">Historique des ventes</h3>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-500" asChild>
                            <Link href="/dashboard/reports">Voir les rapports</Link>
                        </Button>
                    </div>

                    {orders.length === 0 ? (
                        <div className="text-center py-16 flex flex-col items-center px-4">
                            <div className="h-12 w-12 rounded-lg bg-zinc-100 flex items-center justify-center mb-4">
                                <ShoppingCart className="h-6 w-6 text-zinc-400" />
                            </div>
                            <h3 className="text-sm font-semibold text-zinc-950">Aucune commande</h3>
                            <p className="mt-1 text-sm text-zinc-500 max-w-xs">
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
                                            <TableHead className="text-xs font-medium text-zinc-500 pl-4">Référence</TableHead>
                                            <TableHead className="text-xs font-medium text-zinc-500">Client</TableHead>
                                            <TableHead className="text-xs font-medium text-zinc-500">Paiement</TableHead>
                                            <TableHead className="text-xs font-medium text-zinc-500 text-right">Montant</TableHead>
                                            <TableHead className="text-xs font-medium text-zinc-500 text-right">Reste</TableHead>
                                            <TableHead className="text-xs font-medium text-zinc-500">Statut</TableHead>
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
                                                            <span className="text-sm font-medium text-zinc-950 font-mono">{order.order_number}</span>
                                                            <p className="text-xs text-zinc-400">
                                                                {new Date(order.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                                                            </p>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Link
                                                            href={`/dashboard/clients/${order.client_id}`}
                                                            className="text-sm font-medium text-zinc-700 hover:text-zinc-950 transition-colors"
                                                        >
                                                            {order.client_name || 'Client passager'}
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
                                                            {payment.label}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <span className="text-sm font-semibold text-zinc-950">
                                                            {formatCurrency(Number(order.total_amount))}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {remaining > 0 ? (
                                                            <span className="text-sm font-medium text-red-600">{formatCurrency(remaining)}</span>
                                                        ) : (
                                                            <span className="text-xs font-medium text-emerald-600">Soldé</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant={status.variant}
                                                            className={`text-[10px] font-medium ${status.variant === 'secondary' ? 'bg-zinc-100 text-zinc-600' :
                                                                status.variant === 'destructive' ? 'bg-red-50 text-red-600' :
                                                                    'bg-blue-50 text-blue-600'
                                                                } border-none`}
                                                        >
                                                            {status.label}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="pr-4 text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md">
                                                                    <MoreHorizontal className="h-4 w-4 text-zinc-400" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-48">
                                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                                    <Link href={`/dashboard/sales/${order.id}`} className="flex items-center gap-2">
                                                                        <Eye className="h-4 w-4 text-zinc-500" />
                                                                        <span className="text-sm">Voir le détail</span>
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                                    <Link href={`/dashboard/invoices/${order.id}`} className="flex items-center gap-2">
                                                                        <FileText className="h-4 w-4 text-zinc-500" />
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
                            <div className="md:hidden divide-y divide-zinc-100">
                                {orders.map((order) => {
                                    const remaining = Number(order.total_amount) - Number(order.paid_amount)
                                    const status = statusConfig[order.status] || { label: order.status, variant: 'secondary' as const }
                                    const payment = paymentConfig[order.payment_method ?? ''] || { label: order.payment_method || '-' }

                                    return (
                                        <Link
                                            key={order.id}
                                            href={`/dashboard/sales/${order.id}`}
                                            className="block p-4 active:bg-zinc-50 transition-colors"
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-zinc-950 truncate">
                                                        {order.client_name || 'Client passager'}
                                                    </p>
                                                    <p className="text-xs text-zinc-400 font-mono">
                                                        {order.order_number} · {new Date(order.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                                <Badge
                                                    variant={status.variant}
                                                    className={`text-[10px] font-medium ml-2 shrink-0 ${status.variant === 'secondary' ? 'bg-zinc-100 text-zinc-600' :
                                                        status.variant === 'destructive' ? 'bg-red-50 text-red-600' :
                                                            'bg-blue-50 text-blue-600'
                                                        } border-none`}
                                                >
                                                    {status.label}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
                                                        {payment.label}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-zinc-950">{formatCurrency(Number(order.total_amount))}</p>
                                                    {remaining > 0 && (
                                                        <p className="text-xs font-medium text-red-500">Reste: {formatCurrency(remaining)}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </Link>
                                    )
                                })}
                            </div>
                        </>
                    )}
                </div>
            </main>
        </div>
    )
}
