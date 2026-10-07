import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
import {
    ArrowLeft,
    Calendar,
    Clock,
    Truck,
    CheckCircle2,
    Building2,
    User,
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

type Tone = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

const statusConfig: Record<string, { label: string; tone: Tone }> = {
    pending: { label: 'En attente', tone: 'warning' },
    confirmed: { label: 'Confirmée', tone: 'info' },
    partial: { label: 'Partiellement reçue', tone: 'brand' },
    received: { label: 'Reçue', tone: 'success' },
    cancelled: { label: 'Annulée', tone: 'default' },
}

function progressTone(pct: number) {
    return pct >= 100 ? 'bg-success' : pct >= 50 ? 'bg-warning' : 'bg-destructive'
}

function ProgressBar({ pct, label }: { pct: number; label: string }) {
    return (
        <div className="flex min-w-[110px] items-center gap-2">
            <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={label}
            >
                <div className={`h-full rounded-full ${progressTone(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span className="tabular w-9 text-right text-xs text-muted-foreground">{pct}%</span>
        </div>
    )
}

function InfoRow({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-4 text-sm">
            <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
            </span>
            <span className="min-w-0 text-right font-medium text-foreground">{children}</span>
        </div>
    )
}

export default async function ProcurementDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await requirePageSession()
    if (!session?.user?.companyId) return null

    const order = await getOrderDetails(id, session.user.companyId)
    if (!order) notFound()

    const statusInfo = statusConfig[order.status] || { label: order.status, tone: 'default' as Tone }

    // Comparison stats
    const totalOrdered = order.items.reduce((s: number, i: any) => s + Number(i.quantity_ordered), 0)
    const totalReceived = order.items.reduce((s: number, i: any) => s + Number(i.quantity_received || 0), 0)
    const totalDamaged = order.items.reduce((s: number, i: any) => s + Number(i.quantity_damaged || 0), 0)
    const totalPending = totalOrdered - totalReceived - totalDamaged
    const fulfillmentPct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0
    const canReceive = ['pending', 'confirmed', 'partial'].includes(order.status)

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title={`Commande ${order.order_number}`}
                description="Détails et suivi de la commande fournisseur"
            />

            <PageShell>
                <div className="space-y-4">
                    <Button variant="ghost" size="sm" asChild className="-ml-2 print:hidden">
                        <Link href="/dashboard/procurement">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Approvisionnement
                        </Link>
                    </Button>
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-3">
                                <h2 className="font-mono text-2xl font-semibold tracking-tight text-foreground">
                                    {order.order_number}
                                </h2>
                                <StatusBadge label={statusInfo.label} tone={statusInfo.tone} />
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {order.supplier_name || 'Fournisseur inconnu'} · commandée le {formatDateShort(order.ordered_at)}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 print:hidden">
                            <PrintButton />
                            {canReceive && (
                                <Button asChild variant="brand">
                                    <Link href={`/dashboard/procurement/${order.id}/receive`}>
                                        <ArchiveRestore className="h-4 w-4" aria-hidden="true" /> Réceptionner
                                    </Link>
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <StatCard label="Commandé" value={formatNumber(totalOrdered)} icon={ClipboardCheck} tone="info" />
                    <StatCard label="Reçu" value={formatNumber(totalReceived)} icon={CheckCircle2} tone="success" />
                    <StatCard label="Endommagé" value={formatNumber(totalDamaged)} icon={PackageX} tone="danger" />
                    <StatCard label="En attente" value={formatNumber(Math.max(0, totalPending))} icon={Hourglass} tone="warning" />
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                    <Panel
                        className="lg:col-span-2"
                        title="Rapport de comparaison"
                        description="Commandé, reçu et endommagé par article"
                        action={
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground">Taux de réception</p>
                                <p className="tabular text-sm font-semibold text-foreground">{fulfillmentPct}%</p>
                            </div>
                        }
                    >
                        {/* Tableau (desktop + impression) */}
                        <div className="hidden overflow-x-auto md:block print:block">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="pl-5">Article</TableHead>
                                        <TableHead>Format</TableHead>
                                        <TableHead className="text-right">Commandé</TableHead>
                                        <TableHead className="text-right">Reçu</TableHead>
                                        <TableHead className="text-right">Endommagé</TableHead>
                                        <TableHead className="text-right">Écart</TableHead>
                                        <TableHead>Avancement</TableHead>
                                        <TableHead className="pr-5 text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {order.items.map((item: any) => {
                                        const ordered = Number(item.quantity_ordered)
                                        const received = Number(item.quantity_received || 0)
                                        const damaged = Number(item.quantity_damaged || 0)
                                        const gap = ordered - received - damaged
                                        const pct = ordered > 0 ? Math.round((received / ordered) * 100) : 0
                                        return (
                                            <TableRow key={item.id} className="hover:bg-muted/40">
                                                <TableCell className="py-3 pl-5">
                                                    <p className="font-medium text-foreground">{item.product_name}</p>
                                                    {item.product_volume && (
                                                        <p className="text-xs text-muted-foreground">{item.product_volume}</p>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-3 text-sm text-muted-foreground">{item.packaging_name}</TableCell>
                                                <TableCell className="tabular py-3 text-right font-medium text-foreground">{formatNumber(ordered)}</TableCell>
                                                <TableCell className={`tabular py-3 text-right font-medium ${received >= ordered ? 'text-success' : 'text-foreground'}`}>
                                                    {formatNumber(received)}
                                                </TableCell>
                                                <TableCell className="tabular py-3 text-right">
                                                    {damaged > 0 ? (
                                                        <span className="inline-flex items-center gap-1 font-medium text-destructive">
                                                            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                                                            {formatNumber(damaged)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground">0</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="tabular py-3 text-right">
                                                    {gap > 0 ? (
                                                        <span className="font-medium text-warning-foreground">-{formatNumber(gap)}</span>
                                                    ) : gap === 0 ? (
                                                        <span className="font-medium text-success">OK</span>
                                                    ) : (
                                                        <span className="font-medium text-info">+{formatNumber(Math.abs(gap))}</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-3">
                                                    <ProgressBar pct={pct} label={`Avancement ${item.product_name}`} />
                                                </TableCell>
                                                <TableCell className="tabular py-3 pr-5 text-right font-medium text-foreground">
                                                    {formatMoney(ordered * Number(item.unit_price))}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                                <TableFooter>
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={2} className="py-3 pl-5 font-medium text-foreground">Totaux</TableCell>
                                        <TableCell className="tabular py-3 text-right font-semibold text-foreground">{formatNumber(totalOrdered)}</TableCell>
                                        <TableCell className="tabular py-3 text-right font-semibold text-success">{formatNumber(totalReceived)}</TableCell>
                                        <TableCell className="tabular py-3 text-right font-semibold text-destructive">{formatNumber(totalDamaged)}</TableCell>
                                        <TableCell className="tabular py-3 text-right font-semibold text-warning-foreground">
                                            {Math.max(0, totalPending) > 0 ? `-${formatNumber(totalPending)}` : 'OK'}
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <ProgressBar pct={fulfillmentPct} label="Avancement global" />
                                        </TableCell>
                                        <TableCell className="tabular py-3 pr-5 text-right text-base font-semibold text-foreground">
                                            {formatMoney(order.total_amount)}
                                        </TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </div>

                        {/* Cartes (mobile) */}
                        <ul className="divide-y divide-border md:hidden print:hidden">
                            {order.items.map((item: any) => {
                                const ordered = Number(item.quantity_ordered)
                                const received = Number(item.quantity_received || 0)
                                const damaged = Number(item.quantity_damaged || 0)
                                const pct = ordered > 0 ? Math.round((received / ordered) * 100) : 0
                                return (
                                    <li key={item.id} className="space-y-2 px-5 py-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-foreground">{item.product_name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {[item.product_volume, item.packaging_name].filter(Boolean).join(' · ')}
                                                </p>
                                            </div>
                                            <span className="tabular text-sm font-semibold text-foreground">
                                                {formatMoney(ordered * Number(item.unit_price))}
                                            </span>
                                        </div>
                                        <p className="tabular text-xs text-muted-foreground">
                                            Commandé {formatNumber(ordered)} · Reçu {formatNumber(received)}
                                            {damaged > 0 && <span className="text-destructive"> · Endommagé {formatNumber(damaged)}</span>}
                                        </p>
                                        <ProgressBar pct={pct} label={`Avancement ${item.product_name}`} />
                                    </li>
                                )
                            })}
                            <li className="flex items-center justify-between bg-muted/40 px-5 py-3">
                                <span className="text-sm font-medium text-foreground">Total</span>
                                <span className="tabular text-base font-semibold text-foreground">{formatMoney(order.total_amount)}</span>
                            </li>
                        </ul>
                    </Panel>

                    <div className="space-y-6">
                        <Panel title="Informations" bodyClassName="space-y-3 p-5">
                            <InfoRow icon={Calendar} label="Commandée le">
                                <span className="tabular">{formatDateShort(order.ordered_at)}</span>
                            </InfoRow>
                            <InfoRow icon={Clock} label="Livraison prévue">
                                <span className="tabular">{order.expected_delivery_at ? formatDate(order.expected_delivery_at) : 'Non spécifiée'}</span>
                            </InfoRow>
                            <Separator />
                            <InfoRow icon={Building2} label="Fournisseur">
                                <span className="block">{order.supplier_name || 'Fournisseur inconnu'}</span>
                                {order.supplier_phone && (
                                    <span className="tabular block text-xs font-normal text-muted-foreground">{order.supplier_phone}</span>
                                )}
                            </InfoRow>
                            <InfoRow icon={Truck} label="Dépôt de réception">
                                {order.depot_name || '—'}
                            </InfoRow>
                            <Separator />
                            <InfoRow icon={User} label="Créée par">
                                {order.creator_name || '—'}
                            </InfoRow>
                            <Separator />
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Montant total</span>
                                <span className="tabular text-base font-semibold text-foreground">{formatMoney(order.total_amount)}</span>
                            </div>
                        </Panel>

                        {order.notes && (
                            <Panel title="Notes et instructions" bodyClassName="p-5">
                                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{order.notes}</p>
                            </Panel>
                        )}
                    </div>
                </div>
            </PageShell>
        </div>
    )
}
