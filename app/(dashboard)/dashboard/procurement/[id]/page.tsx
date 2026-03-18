import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
    ArrowLeft,
    Calendar,
    Clock,
    Truck,
    CheckCircle2,
    AlertTriangle,
    Building2,
    User,
    Package,
    ArchiveRestore,
    ShieldAlert,
    ClipboardCheck,
    PackageX,
    Hourglass,
} from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface OrderDetail {
    id: string
    order_number: string
    status: string
    total_amount: number
    ordered_at: string
    expected_delivery_at: string | null
    supplier_name: string
    supplier_email: string | null
    supplier_phone: string | null
    depot_name: string
    creator_name: string
    notes: string | null
    items: Array<{
        id: string
        product_name: string
        product_volume: string
        packaging_name: string
        quantity_ordered: number
        quantity_received: number
        quantity_damaged: number
        unit_price: number
        lot_number: string | null
    }>
    [key: string]: unknown
}

async function getOrderDetails(id: string, companyId: string): Promise<OrderDetail | null> {
    try {
        const orders = await sql`
            SELECT 
                po.*, 
                s.name as supplier_name,
                s.email as supplier_email,
                s.phone as supplier_phone,
                d.name as depot_name,
                u.full_name as creator_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN depots d ON po.depot_id = d.id
            LEFT JOIN users u ON po.created_by = u.id
            WHERE po.id = ${id} AND po.company_id = ${companyId}
        `

        if (orders.length === 0) return null

        const items = await sql`
            SELECT 
                poi.*, 
                p.name as product_name, 
                p.base_unit as product_volume,
                pt.name as packaging_name
            FROM purchase_order_items poi
            JOIN product_variants pv ON poi.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            JOIN packaging_types pt ON pv.packaging_type_id = pt.id
            WHERE poi.purchase_order_id = ${id}
        `

        return {
            ...orders[0],
            items
        } as OrderDetail
    } catch (error) {
        console.error('Error fetching order detail:', error)
        return null
    }
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    pending: { label: 'En attente', color: 'bg-slate-100 text-slate-600', icon: Clock },
    confirmed: { label: 'Confirmée', color: 'bg-blue-100 text-blue-600', icon: CheckCircle2 },
    partial: { label: 'Partielle', color: 'bg-amber-100 text-amber-600', icon: AlertTriangle },
    received: { label: 'Reçue', color: 'bg-emerald-100 text-emerald-600', icon: Truck },
    cancelled: { label: 'Annulée', color: 'bg-destructive/10 text-destructive', icon: AlertTriangle },
}

export default async function ProcurementDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await auth()
    if (!session?.user?.companyId) return null

    const order = await getOrderDetails(id, session.user.companyId)
    if (!order) notFound()

    const statusInfo = statusConfig[order.status] || statusConfig.pending
    const StatusIcon = statusInfo.icon

    // Comparison stats
    const totalOrdered = order.items.reduce((s: number, i: any) => s + Number(i.quantity_ordered), 0)
    const totalReceived = order.items.reduce((s: number, i: any) => s + Number(i.quantity_received || 0), 0)
    const totalDamaged = order.items.reduce((s: number, i: any) => s + Number(i.quantity_damaged || 0), 0)
    const totalPending = totalOrdered - totalReceived - totalDamaged
    const fulfillmentPct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0

    const comparisonStats = [
        { title: 'Commandé', value: totalOrdered, icon: ClipboardCheck, color: 'bg-blue-500/10 text-blue-600' },
        { title: 'Reçu', value: totalReceived, icon: CheckCircle2, color: 'bg-emerald-500/10 text-emerald-600' },
        { title: 'Endommagé', value: totalDamaged, icon: PackageX, color: 'bg-rose-500/10 text-rose-600' },
        { title: 'En attente', value: Math.max(0, totalPending), icon: Hourglass, color: 'bg-amber-500/10 text-amber-600' },
    ]

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title={`Commande ${order.order_number}`}
                description="Détails et suivi de la commande fournisseur"
            />

            <main className="flex-1 p-4 lg:p-6 space-y-6 ">
                <div className="flex items-center justify-between gap-4">
                    <Button variant="ghost" size="sm" asChild className="rounded-xl border border-slate-200">
                        <Link href="/dashboard/procurement">
                            <ArrowLeft className="h-4 w-4 mr-2" /> Retour à la liste
                        </Link>
                    </Button>

                    <div className="flex gap-3">
                        {['pending', 'confirmed', 'partial'].includes(order.status) && (
                            <Button asChild className="rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 font-bold h-10 px-6">
                                <Link href={`/dashboard/procurement/${order.id}/receive`}>
                                    <ArchiveRestore className="h-4 w-4 mr-2" /> Réceptionner
                                </Link>
                            </Button>
                        )}
                        <Button variant="outline" className="rounded-xl border-slate-200 font-bold h-10">
                            Imprimer
                        </Button>
                    </div>
                </div>

                {/* Comparison Stats */}
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {comparisonStats.map((stat) => (
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
                                    <div className="text-3xl font-semibold text-slate-950 tracking-tight">{stat.value}</div>
                                </div>
                            </div>
                            <div className="absolute -right-4 -bottom-4 h-32 w-32 bg-slate-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-700" />
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Info */}
                    <Card className="lg:col-span-2 rounded-lg border-slate-200/60 shadow-sm overflow-hidden">
                        <CardHeader className="px-8 py-8 border-b border-slate-100 bg-white">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-xl font-semibold text-slate-950">Rapport de Comparaison</CardTitle>
                                    <CardDescription className="mt-1">Commandé vs Reçu vs Endommagé</CardDescription>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-right">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Taux réception</p>
                                        <p className={`text-lg font-semibold ${fulfillmentPct >= 100 ? 'text-emerald-600' : fulfillmentPct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                                            {fulfillmentPct}%
                                        </p>
                                    </div>
                                    <Badge className={`rounded-full px-4 py-1 font-semibold uppercase text-[10px] tracking-wider ${statusInfo.color} border-none shadow-none gap-2`}>
                                        <StatusIcon className="h-3 w-3" />
                                        {statusInfo.label}
                                    </Badge>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50/50">
                                        <tr>
                                            <th className="text-left py-4 px-8 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Article</th>
                                            <th className="text-center py-4 px-3 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Format</th>
                                            <th className="text-center py-4 px-3 font-semibold uppercase text-[10px] tracking-wider text-blue-500">Commandé</th>
                                            <th className="text-center py-4 px-3 font-semibold uppercase text-[10px] tracking-wider text-emerald-500">Reçu</th>
                                            <th className="text-center py-4 px-3 font-semibold uppercase text-[10px] tracking-wider text-rose-500">Endommagé</th>
                                            <th className="text-center py-4 px-3 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Écart</th>
                                            <th className="text-left py-4 px-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Avancement</th>
                                            <th className="text-right py-4 px-8 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {order.items.map((item: any) => {
                                            const ordered = Number(item.quantity_ordered)
                                            const received = Number(item.quantity_received || 0)
                                            const damaged = Number(item.quantity_damaged || 0)
                                            const gap = ordered - received - damaged
                                            const pct = ordered > 0 ? Math.round((received / ordered) * 100) : 0
                                            return (
                                                <tr key={item.id} className="hover:bg-slate-50/30 transition-colors">
                                                    <td className="py-5 px-8">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                                                                <Package className="h-5 w-5" />
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="font-semibold text-slate-950">{item.product_name}</span>
                                                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{item.product_volume}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-5 px-3 text-center">
                                                        <span className="inline-flex px-2.5 py-1 rounded-lg bg-slate-100 text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
                                                            {item.packaging_name}
                                                        </span>
                                                    </td>
                                                    <td className="py-5 px-3 text-center">
                                                        <span className="font-semibold text-blue-600 text-base">{ordered}</span>
                                                    </td>
                                                    <td className="py-5 px-3 text-center">
                                                        <span className={`font-semibold text-base ${received >= ordered ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                            {received}
                                                        </span>
                                                    </td>
                                                    <td className="py-5 px-3 text-center">
                                                        {damaged > 0 ? (
                                                            <span className="inline-flex items-center gap-1 font-semibold text-rose-600">
                                                                <ShieldAlert className="h-3.5 w-3.5" />
                                                                {damaged}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300 font-bold">0</span>
                                                        )}
                                                    </td>
                                                    <td className="py-5 px-3 text-center">
                                                        {gap > 0 ? (
                                                            <span className="font-semibold text-amber-600">-{gap}</span>
                                                        ) : gap === 0 ? (
                                                            <span className="font-semibold text-emerald-600">OK</span>
                                                        ) : (
                                                            <span className="font-semibold text-blue-600">+{Math.abs(gap)}</span>
                                                        )}
                                                    </td>
                                                    <td className="py-5 px-4">
                                                        <div className="flex items-center gap-2 min-w-[100px]">
                                                            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-[10px] font-semibold text-slate-400 w-8 text-right">{pct}%</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-5 px-8 text-right">
                                                        <span className="font-semibold text-slate-950">
                                                            {new Intl.NumberFormat('fr-FR').format(ordered * Number(item.unit_price))}
                                                        </span>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                    <tfoot className="bg-slate-50/30">
                                        <tr className="border-t border-slate-100">
                                            <td colSpan={2} className="py-6 px-8 font-semibold text-slate-400 uppercase text-[11px] tracking-wider">Totaux</td>
                                            <td className="py-6 px-3 text-center font-semibold text-blue-600">{totalOrdered}</td>
                                            <td className="py-6 px-3 text-center font-semibold text-emerald-600">{totalReceived}</td>
                                            <td className="py-6 px-3 text-center font-semibold text-rose-600">{totalDamaged}</td>
                                            <td className="py-6 px-3 text-center font-semibold text-amber-600">{Math.max(0, totalPending) > 0 ? `-${totalPending}` : 'OK'}</td>
                                            <td className="py-6 px-4">
                                                <div className="flex items-center gap-2 min-w-[100px]">
                                                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${fulfillmentPct >= 100 ? 'bg-emerald-500' : fulfillmentPct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                            style={{ width: `${Math.min(fulfillmentPct, 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] font-semibold text-slate-400 w-8 text-right">{fulfillmentPct}%</span>
                                                </div>
                                            </td>
                                            <td className="py-6 px-8 text-right font-semibold text-xl text-blue-600 tracking-tight">
                                                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(order.total_amount)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Sidebar Info */}
                    <div className="space-y-6">
                        <Card className="rounded-lg border-slate-200/60 shadow-sm overflow-hidden">
                            <CardHeader className="px-8 py-8 border-b border-slate-100">
                                <CardTitle className="text-xl font-semibold text-slate-950 tracking-tight">Informations</CardTitle>
                            </CardHeader>
                            <CardContent className="p-8 space-y-6">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3 text-slate-400">
                                            <Calendar className="h-4 w-4" />
                                            <span className="text-sm font-bold uppercase tracking-wider text-[10px]">Commandé le</span>
                                        </div>
                                        <span className="text-sm font-semibold text-slate-950">
                                            {new Date(order.ordered_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3 text-slate-400">
                                            <Clock className="h-4 w-4" />
                                            <span className="text-sm font-bold uppercase tracking-wider text-[10px]">Livraison prévue</span>
                                        </div>
                                        <span className="text-sm font-semibold text-slate-950">
                                            {order.expected_delivery_at
                                                ? new Date(order.expected_delivery_at).toLocaleDateString('fr-FR')
                                                : 'Non spécifié'}
                                        </span>
                                    </div>
                                    <Separator className="bg-slate-100" />
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3 text-slate-400">
                                            <Building2 className="h-4 w-4" />
                                            <span className="text-sm font-bold uppercase tracking-wider text-[10px]">Fournisseur</span>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="font-semibold text-slate-950 underline decoration-blue-500/30 decoration-2 underline-offset-4">{order.supplier_name}</span>
                                            {order.supplier_phone && <span className="text-xs font-bold text-slate-400 mt-1">{order.supplier_phone}</span>}
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3 text-slate-400">
                                            <Truck className="h-4 w-4" />
                                            <span className="text-sm font-bold uppercase tracking-wider text-[10px]">Dépôt de réception</span>
                                        </div>
                                        <span className="font-semibold text-slate-950 italic">{order.depot_name}</span>
                                    </div>
                                    <Separator className="bg-slate-100" />
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-3 text-slate-400">
                                            <User className="h-4 w-4" />
                                            <span className="text-sm font-bold uppercase tracking-wider text-[10px]">Créé par</span>
                                        </div>
                                        <span className="text-xs font-semibold text-slate-950">{order.creator_name}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {order.notes && (
                            <Card className="rounded-lg border-slate-200/60 shadow-sm overflow-hidden bg-white/50 backdrop-blur-sm">
                                <CardHeader className="px-8 py-6 border-b border-slate-100/50">
                                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-400">Notes & Instructions</CardTitle>
                                </CardHeader>
                                <CardContent className="p-8">
                                    <p className="text-sm font-bold text-slate-600 italic leading-relaxed">"{order.notes}"</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
