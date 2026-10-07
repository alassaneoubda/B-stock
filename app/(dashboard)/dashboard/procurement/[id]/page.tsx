import { requirePageSession } from '@/lib/page-auth'
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
import { isUuid } from '@/lib/tenant'
import { formatDate, formatDateShort, formatMoney, formatNumber } from '@/lib/format'
import { PrintButton } from './print-button'

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
        // Identifiant mal formé : 404 plutôt qu'une erreur SQL
        if (!isUuid(id)) return null

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
            LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
            WHERE poi.purchase_order_id = ${id}
            ORDER BY p.name, pt.name, poi.id
        `

        return {
            ...orders[0],
            items
        } as OrderDetail
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    pending: { label: 'En attente', color: 'bg-muted text-muted-foreground', icon: Clock },
    confirmed: { label: 'Confirmée', color: 'bg-brand-soft text-brand-strong', icon: CheckCircle2 },
    partial: { label: 'Partiellement reçue', color: 'bg-warning-soft text-warning-foreground', icon: AlertTriangle },
    received: { label: 'Reçue', color: 'bg-success-soft text-success', icon: Truck },
    cancelled: { label: 'Annulée', color: 'bg-destructive/10 text-destructive', icon: AlertTriangle },
}

export default async function ProcurementDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await requirePageSession()
    if (!session?.user?.companyId) return null

    const order = await getOrderDetails(id, session.user.companyId)
    if (!order) notFound()

    const statusInfo = statusConfig[order.status] || { label: order.status, color: 'bg-muted text-muted-foreground', icon: Clock }
    const StatusIcon = statusInfo.icon

    // Comparison stats
    const totalOrdered = order.items.reduce((s: number, i: any) => s + Number(i.quantity_ordered), 0)
    const totalReceived = order.items.reduce((s: number, i: any) => s + Number(i.quantity_received || 0), 0)
    const totalDamaged = order.items.reduce((s: number, i: any) => s + Number(i.quantity_damaged || 0), 0)
    const totalPending = totalOrdered - totalReceived - totalDamaged
    const fulfillmentPct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0

    const comparisonStats = [
        { title: 'Commandé', value: totalOrdered, icon: ClipboardCheck, color: 'bg-primary/10 text-brand-strong' },
        { title: 'Reçu', value: totalReceived, icon: CheckCircle2, color: 'bg-success/10 text-success' },
        { title: 'Endommagé', value: totalDamaged, icon: PackageX, color: 'bg-destructive/10 text-destructive' },
        { title: 'En attente', value: Math.max(0, totalPending), icon: Hourglass, color: 'bg-warning/10 text-warning-foreground' },
    ]

    return (
        <div className="flex flex-col min-h-screen bg-muted/30">
            <DashboardHeader
                title={`Commande ${order.order_number}`}
                description="Détails et suivi de la commande fournisseur"
            />

            <main className="flex-1 p-4 lg:p-6 space-y-6 ">
                <div className="flex items-center justify-between gap-4">
                    <Button variant="ghost" size="sm" asChild className="rounded-xl border border-border">
                        <Link href="/dashboard/procurement">
                            <ArrowLeft className="h-4 w-4 mr-2" /> Retour à la liste
                        </Link>
                    </Button>

                    <div className="flex gap-3">
                        {['pending', 'confirmed', 'partial'].includes(order.status) && (
                            <Button asChild className="rounded-xl bg-success hover:bg-success shadow-lg shadow-emerald-500/20 font-bold h-10 px-6">
                                <Link href={`/dashboard/procurement/${order.id}/receive`}>
                                    <ArchiveRestore className="h-4 w-4 mr-2" /> Réceptionner
                                </Link>
                            </Button>
                        )}
                        <PrintButton />
                    </div>
                </div>

                {/* Comparison Stats */}
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {comparisonStats.map((stat) => (
                        <div
                            key={stat.title}
                            className="group relative overflow-hidden rounded-lg bg-card p-8 shadow-sm border border-border hover:shadow-md hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-500"
                        >
                            <div className="relative z-10 flex flex-col gap-6">
                                <div className={`flex h-14 w-14 items-center justify-center rounded-md ${stat.color} transition-transform group-hover:scale-110 duration-500`}>
                                    <stat.icon className="h-7 w-7" />
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">{stat.title}</p>
                                    <div className="text-3xl font-semibold text-foreground tracking-tight">{formatNumber(stat.value)}</div>
                                </div>
                            </div>
                            <div className="absolute -right-4 -bottom-4 h-32 w-32 bg-muted/50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-700" />
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Info */}
                    <Card className="lg:col-span-2 rounded-lg border-border shadow-sm overflow-hidden">
                        <CardHeader className="px-8 py-8 border-b border-border bg-card">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-xl font-semibold text-foreground">Rapport de Comparaison</CardTitle>
                                    <CardDescription className="mt-1">Commandé vs Reçu vs Endommagé</CardDescription>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-right">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Taux réception</p>
                                        <p className={`text-lg font-semibold ${fulfillmentPct >= 100 ? 'text-success' : fulfillmentPct >= 50 ? 'text-warning-foreground' : 'text-destructive'}`}>
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
                                    <thead className="bg-muted/30">
                                        <tr>
                                            <th className="text-left py-4 px-8 font-semibold uppercase text-[10px] tracking-wider text-muted-foreground/70">Article</th>
                                            <th className="text-center py-4 px-3 font-semibold uppercase text-[10px] tracking-wider text-muted-foreground/70">Format</th>
                                            <th className="text-center py-4 px-3 font-semibold uppercase text-[10px] tracking-wider text-brand-strong">Commandé</th>
                                            <th className="text-center py-4 px-3 font-semibold uppercase text-[10px] tracking-wider text-success">Reçu</th>
                                            <th className="text-center py-4 px-3 font-semibold uppercase text-[10px] tracking-wider text-destructive">Endommagé</th>
                                            <th className="text-center py-4 px-3 font-semibold uppercase text-[10px] tracking-wider text-muted-foreground/70">Écart</th>
                                            <th className="text-left py-4 px-4 font-semibold uppercase text-[10px] tracking-wider text-muted-foreground/70">Avancement</th>
                                            <th className="text-right py-4 px-8 font-semibold uppercase text-[10px] tracking-wider text-muted-foreground/70">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {order.items.map((item: any) => {
                                            const ordered = Number(item.quantity_ordered)
                                            const received = Number(item.quantity_received || 0)
                                            const damaged = Number(item.quantity_damaged || 0)
                                            const gap = ordered - received - damaged
                                            const pct = ordered > 0 ? Math.round((received / ordered) * 100) : 0
                                            return (
                                                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                                                    <td className="py-5 px-8">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
                                                                <Package className="h-5 w-5" />
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="font-semibold text-foreground">{item.product_name}</span>
                                                                <span className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider">{item.product_volume}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-5 px-3 text-center">
                                                        <span className="inline-flex px-2.5 py-1 rounded-lg bg-muted text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                                            {item.packaging_name}
                                                        </span>
                                                    </td>
                                                    <td className="py-5 px-3 text-center">
                                                        <span className="font-semibold text-brand-strong text-base">{formatNumber(ordered)}</span>
                                                    </td>
                                                    <td className="py-5 px-3 text-center">
                                                        <span className={`font-semibold text-base ${received >= ordered ? 'text-success' : 'text-muted-foreground'}`}>
                                                            {formatNumber(received)}
                                                        </span>
                                                    </td>
                                                    <td className="py-5 px-3 text-center">
                                                        {damaged > 0 ? (
                                                            <span className="inline-flex items-center gap-1 font-semibold text-destructive">
                                                                <ShieldAlert className="h-3.5 w-3.5" />
                                                                {formatNumber(damaged)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground/70 font-bold">0</span>
                                                        )}
                                                    </td>
                                                    <td className="py-5 px-3 text-center">
                                                        {gap > 0 ? (
                                                            <span className="font-semibold text-warning-foreground">-{formatNumber(gap)}</span>
                                                        ) : gap === 0 ? (
                                                            <span className="font-semibold text-success">OK</span>
                                                        ) : (
                                                            <span className="font-semibold text-brand-strong">+{formatNumber(Math.abs(gap))}</span>
                                                        )}
                                                    </td>
                                                    <td className="py-5 px-4">
                                                        <div className="flex items-center gap-2 min-w-[100px]">
                                                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-success' : pct >= 50 ? 'bg-warning' : 'bg-destructive'}`}
                                                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-[10px] font-semibold text-muted-foreground/70 w-8 text-right">{pct}%</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-5 px-8 text-right">
                                                        <span className="font-semibold text-foreground">
                                                            {formatMoney(ordered * Number(item.unit_price))}
                                                        </span>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                    <tfoot className="bg-muted/30">
                                        <tr className="border-t border-border">
                                            <td colSpan={2} className="py-6 px-8 font-semibold text-muted-foreground/70 uppercase text-[11px] tracking-wider">Totaux</td>
                                            <td className="py-6 px-3 text-center font-semibold text-brand-strong">{formatNumber(totalOrdered)}</td>
                                            <td className="py-6 px-3 text-center font-semibold text-success">{formatNumber(totalReceived)}</td>
                                            <td className="py-6 px-3 text-center font-semibold text-destructive">{formatNumber(totalDamaged)}</td>
                                            <td className="py-6 px-3 text-center font-semibold text-warning-foreground">{Math.max(0, totalPending) > 0 ? `-${formatNumber(totalPending)}` : 'OK'}</td>
                                            <td className="py-6 px-4">
                                                <div className="flex items-center gap-2 min-w-[100px]">
                                                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${fulfillmentPct >= 100 ? 'bg-success' : fulfillmentPct >= 50 ? 'bg-warning' : 'bg-destructive'}`}
                                                            style={{ width: `${Math.min(fulfillmentPct, 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] font-semibold text-muted-foreground/70 w-8 text-right">{fulfillmentPct}%</span>
                                                </div>
                                            </td>
                                            <td className="py-6 px-8 text-right font-semibold text-xl text-brand-strong tracking-tight">
                                                {formatMoney(order.total_amount)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Sidebar Info */}
                    <div className="space-y-6">
                        <Card className="rounded-lg border-border shadow-sm overflow-hidden">
                            <CardHeader className="px-8 py-8 border-b border-border">
                                <CardTitle className="text-xl font-semibold text-foreground tracking-tight">Informations</CardTitle>
                            </CardHeader>
                            <CardContent className="p-8 space-y-6">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3 text-muted-foreground/70">
                                            <Calendar className="h-4 w-4" />
                                            <span className="text-sm font-bold uppercase tracking-wider text-[10px]">Commandé le</span>
                                        </div>
                                        <span className="text-sm font-semibold text-foreground">
                                            {formatDateShort(order.ordered_at)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3 text-muted-foreground/70">
                                            <Clock className="h-4 w-4" />
                                            <span className="text-sm font-bold uppercase tracking-wider text-[10px]">Livraison prévue</span>
                                        </div>
                                        <span className="text-sm font-semibold text-foreground">
                                            {order.expected_delivery_at ? formatDate(order.expected_delivery_at) : 'Non spécifié'}
                                        </span>
                                    </div>
                                    <Separator className="bg-muted" />
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3 text-muted-foreground/70">
                                            <Building2 className="h-4 w-4" />
                                            <span className="text-sm font-bold uppercase tracking-wider text-[10px]">Fournisseur</span>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="font-semibold text-foreground underline decoration-blue-500/30 decoration-2 underline-offset-4">{order.supplier_name || 'Fournisseur inconnu'}</span>
                                            {order.supplier_phone && <span className="text-xs font-bold text-muted-foreground/70 mt-1">{order.supplier_phone}</span>}
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3 text-muted-foreground/70">
                                            <Truck className="h-4 w-4" />
                                            <span className="text-sm font-bold uppercase tracking-wider text-[10px]">Dépôt de réception</span>
                                        </div>
                                        <span className="font-semibold text-foreground italic">{order.depot_name}</span>
                                    </div>
                                    <Separator className="bg-muted" />
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-3 text-muted-foreground/70">
                                            <User className="h-4 w-4" />
                                            <span className="text-sm font-bold uppercase tracking-wider text-[10px]">Créé par</span>
                                        </div>
                                        <span className="text-xs font-semibold text-foreground">{order.creator_name || '—'}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {order.notes && (
                            <Card className="rounded-lg border-border shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
                                <CardHeader className="px-8 py-6 border-b border-border">
                                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">Notes & Instructions</CardTitle>
                                </CardHeader>
                                <CardContent className="p-8">
                                    <p className="text-sm font-bold text-muted-foreground italic leading-relaxed">"{order.notes}"</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
