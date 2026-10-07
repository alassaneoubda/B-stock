import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
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
import { Plus, MoreHorizontal, ArchiveRestore, Eye, CheckCircle2, Clock, Truck } from 'lucide-react'
import Link from 'next/link'
import { EmptyState } from '@/components/states'
import { formatDate, formatDateShort, formatMoney, formatNumber } from '@/lib/format'

interface PurchaseOrder {
    id: string
    order_number: string
    supplier_name: string
    status: string
    total_amount: number | null
    ordered_at: string
    expected_delivery_at: string | null
    received_at: string | null
    items_count: number
}

async function getProcurementStats(companyId: string) {
        const pending = await sql`
      SELECT COUNT(*) as count FROM purchase_orders
      WHERE company_id = ${companyId} AND status IN ('pending', 'confirmed')
    `
        const partial = await sql`
      SELECT COUNT(*) as count FROM purchase_orders
      WHERE company_id = ${companyId} AND status = 'partial'
    `
        const received = await sql`
      SELECT COUNT(*) as count FROM purchase_orders
      WHERE company_id = ${companyId} AND status = 'received'
        AND DATE_TRUNC('month', received_at) = DATE_TRUNC('month', NOW())
    `
        return {
            pending: Number(pending[0]?.count || 0),
            partial: Number(partial[0]?.count || 0),
            receivedThisMonth: Number(received[0]?.count || 0),
        }
}

async function getPurchaseOrders(companyId: string): Promise<PurchaseOrder[]> {
        const orders = await sql`
      SELECT
        po.id,
        po.order_number,
        po.status,
        po.total_amount,
        po.ordered_at,
        po.expected_delivery_at,
        po.received_at,
        s.name as supplier_name,
        COUNT(poi.id) as items_count
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      WHERE po.company_id = ${companyId}
      GROUP BY po.id, s.name
      ORDER BY po.ordered_at DESC
      LIMIT 100
    `
        return orders as PurchaseOrder[]
}

const statusConfig: Record<string, { label: string; tone: 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info' }> = {
    pending: { label: 'En attente', tone: 'warning' },
    confirmed: { label: 'Confirmée', tone: 'info' },
    partial: { label: 'Partiellement reçue', tone: 'brand' },
    received: { label: 'Reçue', tone: 'success' },
    cancelled: { label: 'Annulée', tone: 'default' },
}

function OrderStatus({ status }: { status: string }) {
    const info = statusConfig[status]
    return <StatusBadge label={info?.label ?? status} tone={info?.tone ?? 'default'} />
}

export default async function ProcurementPage() {
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''
    const [stats, orders] = await Promise.all([
        getProcurementStats(companyId),
        getPurchaseOrders(companyId),
    ])

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Approvisionnement"
                description="Suivez vos stocks entrants et commandes fournisseurs"
                actions={
                    <Button asChild variant="brand">
                        <Link href="/dashboard/procurement/new">
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Nouvelle commande
                        </Link>
                    </Button>
                }
            />

            <PageShell>
                <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard
                        label="En attente"
                        value={formatNumber(stats.pending)}
                        hint="Commandes lancées"
                        icon={Clock}
                        tone="warning"
                    />
                    <StatCard
                        label="Réceptions partielles"
                        value={formatNumber(stats.partial)}
                        hint="En cours de livraison"
                        icon={Truck}
                        tone="brand"
                    />
                    <StatCard
                        label="Reçues ce mois"
                        value={formatNumber(stats.receivedThisMonth)}
                        hint="Réceptions terminées"
                        icon={CheckCircle2}
                        tone="success"
                    />
                </div>

                <Panel
                    title="Commandes fournisseurs"
                    description="Transactions et états de réception"
                    action={
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/dashboard/suppliers">Fournisseurs</Link>
                        </Button>
                    }
                >
                    {orders.length === 0 ? (
                        <div className="p-5">
                            <EmptyState
                                title="Aucune commande fournisseur"
                                description="Créez une commande pour suivre vos approvisionnements et réceptions."
                                action={{ label: 'Nouvelle commande', href: '/dashboard/procurement/new' }}
                            />
                        </div>
                    ) : (
                        <>
                            {/* Tableau (desktop) */}
                            <div className="hidden overflow-x-auto md:block">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="pl-5">Référence</TableHead>
                                            <TableHead>Fournisseur</TableHead>
                                            <TableHead>Livraison prévue</TableHead>
                                            <TableHead className="text-right">Articles</TableHead>
                                            <TableHead className="text-right">Montant</TableHead>
                                            <TableHead>Statut</TableHead>
                                            <TableHead className="w-12 pr-5">
                                                <span className="sr-only">Actions</span>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {orders.map((order) => (
                                            <TableRow key={order.id} className="relative cursor-pointer transition-colors hover:bg-muted/40">
                                                <TableCell className="py-3 pl-5">
                                                    <Link
                                                        href={`/dashboard/procurement/${order.id}`}
                                                        className="font-mono text-sm font-medium text-foreground after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring/50"
                                                    >
                                                        {order.order_number}
                                                    </Link>
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        {formatDateShort(order.ordered_at)}
                                                    </p>
                                                </TableCell>
                                                <TableCell className="py-3 text-sm text-foreground">
                                                    {order.supplier_name || 'Inconnu'}
                                                </TableCell>
                                                <TableCell className="py-3 text-sm text-muted-foreground">
                                                    {formatDate(order.expected_delivery_at)}
                                                </TableCell>
                                                <TableCell className="tabular py-3 text-right text-sm text-muted-foreground">
                                                    {formatNumber(order.items_count)}
                                                </TableCell>
                                                <TableCell className="tabular py-3 text-right text-sm font-semibold text-foreground">
                                                    {order.total_amount ? formatMoney(order.total_amount) : '—'}
                                                </TableCell>
                                                <TableCell className="py-3">
                                                    <OrderStatus status={order.status} />
                                                </TableCell>
                                                <TableCell className="relative z-10 py-3 pr-5 text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-sm"
                                                                aria-label={`Actions pour la commande ${order.order_number}`}
                                                            >
                                                                <MoreHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-48">
                                                            <DropdownMenuItem asChild className="cursor-pointer">
                                                                <Link href={`/dashboard/procurement/${order.id}`}>
                                                                    <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                                                    Voir le détail
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            {['pending', 'confirmed', 'partial'].includes(order.status) && (
                                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                                    <Link href={`/dashboard/procurement/${order.id}/receive`}>
                                                                        <ArchiveRestore className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                                                        Réceptionner
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Cartes (mobile) */}
                            <ul className="divide-y divide-border md:hidden">
                                {orders.map((order) => (
                                    <li key={order.id}>
                                        <Link
                                            href={`/dashboard/procurement/${order.id}`}
                                            className="block px-5 py-4 transition-colors hover:bg-muted/40 active:bg-muted/60"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium text-foreground">
                                                        {order.supplier_name || 'Fournisseur inconnu'}
                                                    </p>
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        <span className="font-mono">{order.order_number}</span> · {formatDateShort(order.ordered_at)}
                                                    </p>
                                                </div>
                                                <OrderStatus status={order.status} />
                                            </div>
                                            <div className="mt-2 flex items-center justify-between">
                                                <span className="text-xs text-muted-foreground">
                                                    {formatNumber(order.items_count)} article{Number(order.items_count) > 1 ? 's' : ''}
                                                </span>
                                                <span className="tabular text-sm font-semibold text-foreground">
                                                    {order.total_amount ? formatMoney(order.total_amount) : '—'}
                                                </span>
                                            </div>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </Panel>
            </PageShell>
        </div>
    )
}
