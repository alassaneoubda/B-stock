import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
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
    ArchiveRestore,
    Eye,
    ClipboardCheck,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Truck,
    ArrowDownLeft
} from 'lucide-react'
import Link from 'next/link'

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
    try {
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
    } catch {
        return { pending: 0, partial: 0, receivedThisMonth: 0 }
    }
}

async function getPurchaseOrders(companyId: string): Promise<PurchaseOrder[]> {
    try {
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

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ComponentType<{ className?: string }>; color: string }> = {
    pending: { label: 'En attente', variant: 'secondary', icon: Clock, color: 'bg-slate-100 text-slate-500' },
    confirmed: { label: 'Confirmée', variant: 'outline', icon: ClipboardCheck, color: 'bg-blue-50 text-blue-600' },
    partial: { label: 'Partielle', variant: 'outline', icon: AlertTriangle, color: 'bg-amber-50 text-amber-600' },
    received: { label: 'Reçue', variant: 'default', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
    cancelled: { label: 'Annulée', variant: 'destructive', icon: AlertTriangle, color: 'bg-rose-50 text-rose-600' },
}

export default async function ProcurementPage() {
    const session = await auth()
    const companyId = session?.user?.companyId || ''
    const [stats, orders] = await Promise.all([
        getProcurementStats(companyId),
        getPurchaseOrders(companyId),
    ])

    const statsData = [
        {
            title: "En Attente",
            value: stats.pending,
            description: "Commandes lancées",
            icon: Clock,
            color: "bg-amber-500/10 text-amber-600",
        },
        {
            title: "Réceptions Partielles",
            value: stats.partial,
            description: "En cours de livraison",
            icon: Truck,
            color: "bg-blue-500/10 text-blue-600",
        },
        {
            title: "Reçues ce mois",
            value: stats.receivedThisMonth,
            description: "Total réceptions",
            icon: CheckCircle2,
            color: "bg-emerald-500/10 text-emerald-600",
        }
    ]

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title="Approvisionnement"
                description="Suivez vos stocks entrants et commandes fournisseurs"
                actions={
                    <Button asChild className="rounded-md h-11 px-6 bg-blue-600 hover:bg-blue-700 transition-all active:scale-95 font-bold">
                        <Link href="/dashboard/procurement/new" className="flex items-center gap-2">
                            <Plus className="h-5 w-5" />
                            <span>Nouvelle commande</span>
                        </Link>
                    </Button>
                }
            />

            <main className="flex-1 p-4 lg:p-6 space-y-6 ">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {statsData.map((stat) => (
                        <div key={stat.title} className="bg-white rounded-lg border border-zinc-200/80 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-zinc-500">{stat.title}</span>
                                <stat.icon className="h-3.5 w-3.5 text-zinc-400" />
                            </div>
                            <p className="text-lg sm:text-xl font-bold text-zinc-950 tracking-tight">{stat.value}</p>
                            <p className="text-xs text-zinc-500 mt-1">{stat.description}</p>
                        </div>
                    ))}
                </div>

                {/* Procurement Table */}
                <div className="rounded-lg bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                    <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <h3 className="text-base sm:text-lg font-semibold text-slate-950">Commandes Fournisseurs</h3>
                            <p className="text-xs text-slate-400 mt-0.5">Suivez les transactions et états de réception</p>
                        </div>
                        <Button variant="outline" size="sm" className="h-8 text-xs font-medium" asChild>
                            <Link href="/dashboard/suppliers">Fournisseurs</Link>
                        </Button>
                    </div>

                    <div className="p-2">
                        {orders.length === 0 ? (
                            <div className="text-center py-24 flex flex-col items-center">
                                <div className="h-24 w-24 rounded-full bg-slate-50 flex items-center justify-center mb-6">
                                    <ArchiveRestore className="h-10 w-10 text-slate-300" />
                                </div>
                                <h3 className="text-xl font-semibold text-slate-950">Aucun mouvement</h3>
                                <p className="mt-2 text-slate-400 font-medium max-w-xs mx-auto">
                                    Vous n'avez aucune commande fournisseur enregistrée.
                                </p>
                                <Button className="mt-8 rounded-md h-12 px-8 bg-blue-600 hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20" asChild>
                                    <Link href="/dashboard/procurement/new">
                                        <Plus className="h-5 w-5 mr-2" />
                                        Nouvelle commande
                                    </Link>
                                </Button>
                            </div>
                        ) : (
                            <>
                              {/* Desktop table */}
                              <div className="hidden md:block overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-slate-50/50">
                                        <TableRow className="border-none hover:bg-transparent">
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 pl-4">Réf. & Date</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Fournisseur</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Livraison</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Articles</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-right">Montant</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Statut</TableHead>
                                            <TableHead className="py-3 pr-4"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {orders.map((order) => {
                                            const statusInfo = statusConfig[order.status] || { label: order.status, variant: 'secondary' as const, icon: Clock, color: 'bg-slate-100 text-slate-500' }
                                            const StatusIcon = statusInfo.icon
                                            return (
                                                <TableRow key={order.id} className="group border-b border-slate-50 hover:bg-slate-50/50">
                                                    <TableCell className="py-3 pl-4">
                                                        <span className="text-sm font-medium text-slate-950 font-mono">{order.order_number}</span>
                                                        <p className="text-xs text-slate-400 mt-0.5">
                                                            {new Date(order.ordered_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                                                        </p>
                                                    </TableCell>
                                                    <TableCell className="py-3">
                                                        <span className="text-sm text-slate-700">{order.supplier_name || 'Inconnu'}</span>
                                                    </TableCell>
                                                    <TableCell className="py-3">
                                                        <span className="text-xs text-slate-500">
                                                            {order.expected_delivery_at
                                                                ? new Date(order.expected_delivery_at).toLocaleDateString('fr-FR')
                                                                : '—'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="py-3">
                                                        <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                                            {order.items_count} art.
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="py-3 text-right">
                                                        <span className="text-sm font-semibold text-slate-950">
                                                            {order.total_amount ? formatCurrency(Number(order.total_amount)) : '—'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="py-3">
                                                        <Badge className={`text-[10px] font-medium ${statusInfo.color} border-none`}>
                                                            {statusInfo.label}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="py-3 pr-4 text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md">
                                                                    <MoreHorizontal className="h-4 w-4 text-slate-400" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-48">
                                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                                    <Link href={`/dashboard/procurement/${order.id}`} className="flex items-center gap-2">
                                                                        <Eye className="h-4 w-4 text-zinc-500" />
                                                                        <span className="text-sm">Détail</span>
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                                {['pending', 'confirmed', 'partial'].includes(order.status) && (
                                                                    <DropdownMenuItem asChild className="cursor-pointer">
                                                                        <Link href={`/dashboard/procurement/${order.id}/receive`} className="flex items-center gap-2">
                                                                            <ArchiveRestore className="h-4 w-4 text-zinc-500" />
                                                                            <span className="text-sm">Réceptionner</span>
                                                                        </Link>
                                                                    </DropdownMenuItem>
                                                                )}
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
                                    const statusInfo = statusConfig[order.status] || { label: order.status, variant: 'secondary' as const, icon: Clock, color: 'bg-slate-100 text-slate-500' }
                                    return (
                                        <Link
                                            key={order.id}
                                            href={`/dashboard/procurement/${order.id}`}
                                            className="block p-4 active:bg-zinc-50 transition-colors"
                                        >
                                            <div className="flex items-start justify-between mb-1.5">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-zinc-950 truncate">
                                                        {order.supplier_name || 'Fournisseur inconnu'}
                                                    </p>
                                                    <p className="text-xs text-zinc-400 font-mono">
                                                        {order.order_number} · {new Date(order.ordered_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                                                    </p>
                                                </div>
                                                <Badge className={`text-[10px] font-medium ml-2 shrink-0 ${statusInfo.color} border-none`}>
                                                    {statusInfo.label}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center justify-between mt-2">
                                                <span className="text-xs text-zinc-400">{order.items_count} article{Number(order.items_count) > 1 ? 's' : ''}</span>
                                                <span className="text-sm font-bold text-zinc-950">
                                                    {order.total_amount ? formatCurrency(Number(order.total_amount)) : '—'}
                                                </span>
                                            </div>
                                        </Link>
                                    )
                                })}
                              </div>
                            </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}

function Calendar({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
            <line x1="16" x2="16" y1="2" y2="6" />
            <line x1="8" x2="8" y1="2" y2="6" />
            <line x1="3" x2="21" y1="10" y2="10" />
        </svg>
    )
}
