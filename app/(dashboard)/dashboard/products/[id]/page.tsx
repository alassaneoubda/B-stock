import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { notFound } from 'next/navigation'
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
    Edit,
    Package,
    ArrowLeft,
    Warehouse,
    Tag,
    TrendingUp,
    BarChart3,
    BoxesIcon,
} from 'lucide-react'
import Link from 'next/link'

interface ProductDetail {
    id: string
    name: string
    sku: string | null
    category: string | null
    brand: string | null
    description: string | null
    base_unit: string
    purchase_price: number
    selling_price: number
    image_url: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

interface Variant {
    id: string
    packaging_type_id: string
    barcode: string | null
    price: number
    cost_price: number | null
    packaging_name: string
    units_per_case: number
    deposit_price: number
}

interface StockItem {
    id: string
    quantity: number
    lot_number: string | null
    expiry_date: string | null
    min_stock_alert: number
    depot_name: string
    depot_id: string
}

async function getProduct(productId: string, companyId: string): Promise<ProductDetail | null> {
    try {
        const products = await sql`
            SELECT * FROM products
            WHERE id = ${productId} AND company_id = ${companyId}
        `
        return (products[0] as ProductDetail) || null
    } catch {
        return null
    }
}

async function getVariants(productId: string): Promise<Variant[]> {
    try {
        const variants = await sql`
            SELECT pv.*, pt.name as packaging_name, pt.units_per_case, pt.deposit_price
            FROM product_variants pv
            LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
            WHERE pv.product_id = ${productId}
            ORDER BY pt.name
        `
        return variants as Variant[]
    } catch {
        return []
    }
}

async function getStock(productId: string): Promise<StockItem[]> {
    try {
        const stock = await sql`
            SELECT s.*, d.name as depot_name, d.id as depot_id
            FROM stock s
            JOIN depots d ON s.depot_id = d.id
            JOIN product_variants pv ON s.product_variant_id = pv.id
            WHERE pv.product_id = ${productId}
            ORDER BY d.name
        `
        return stock as StockItem[]
    } catch {
        return []
    }
}

interface Movement {
    id: string
    movement_type: string
    quantity: number
    depot_name: string
    created_by_name: string | null
    created_at: string
}

async function getRecentMovements(productId: string): Promise<Movement[]> {
    try {
        const movements = await sql`
            SELECT sm.*, d.name as depot_name, u.full_name as created_by_name
            FROM stock_movements sm
            JOIN depots d ON sm.depot_id = d.id
            LEFT JOIN users u ON sm.created_by = u.id
            JOIN product_variants pv ON sm.product_variant_id = pv.id
            WHERE pv.product_id = ${productId}
            ORDER BY sm.created_at DESC
            LIMIT 20
        `
        return movements as Movement[]
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

const movementTypeLabels: Record<string, { label: string; color: string }> = {
    purchase: { label: 'Achat', color: 'bg-emerald-50 text-emerald-600' },
    sale: { label: 'Vente', color: 'bg-blue-50 text-blue-600' },
    return: { label: 'Retour', color: 'bg-amber-50 text-amber-600' },
    damage: { label: 'Casse', color: 'bg-rose-50 text-rose-600' },
    adjustment: { label: 'Ajustement', color: 'bg-slate-100 text-slate-600' },
    transfer: { label: 'Transfert', color: 'bg-indigo-50 text-indigo-600' },
}

export default async function ProductDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const session = await auth()
    const companyId = session?.user?.companyId || ''

    const [product, variants, stock, movements] = await Promise.all([
        getProduct(id, companyId),
        getVariants(id),
        getStock(id),
        getRecentMovements(id),
    ])

    if (!product) notFound()

    const totalStock = stock.reduce((acc, s) => acc + Number(s.quantity), 0)
    const lowStockItems = stock.filter(s => Number(s.quantity) <= Number(s.min_stock_alert))
    const margin = Number(product.selling_price) - Number(product.purchase_price)
    const marginPct = Number(product.purchase_price) > 0
        ? ((margin / Number(product.purchase_price)) * 100).toFixed(1)
        : '—'

    const statsData = [
        {
            title: 'Stock Total',
            value: `${totalStock} ${product.base_unit}`,
            description: `${stock.length} emplacement${stock.length > 1 ? 's' : ''}`,
            icon: Warehouse,
            color: totalStock < 10 ? 'bg-rose-500/10 text-rose-600' : 'bg-emerald-500/10 text-emerald-600',
        },
        {
            title: 'Variantes',
            value: variants.length,
            description: 'Formats disponibles',
            icon: BoxesIcon,
            color: 'bg-blue-500/10 text-blue-600',
        },
        {
            title: 'Prix de Vente',
            value: formatCurrency(Number(product.selling_price)),
            description: `Achat: ${formatCurrency(Number(product.purchase_price))}`,
            icon: Tag,
            color: 'bg-indigo-500/10 text-indigo-600',
        },
        {
            title: 'Marge',
            value: formatCurrency(margin),
            description: `${marginPct}% de marge`,
            icon: TrendingUp,
            color: margin > 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600',
        },
    ]

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title={product.name}
                description={`${product.category || 'Non classé'} ${product.brand ? `— ${product.brand}` : ''} ${product.sku ? `(${product.sku})` : ''}`}
                actions={
                    <div className="flex gap-2">
                        <Button variant="outline" asChild className="rounded-md h-11 px-6 font-bold">
                            <Link href="/dashboard/products">
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Retour
                            </Link>
                        </Button>
                        <Button asChild className="rounded-md h-11 px-6 bg-blue-600 hover:bg-blue-700 transition-all active:scale-95 font-bold">
                            <Link href={`/dashboard/products/${id}/edit`}>
                                <Edit className="h-4 w-4 mr-2" />
                                Modifier
                            </Link>
                        </Button>
                    </div>
                }
            />

            <main className="flex-1 p-4 lg:p-6 space-y-6 ">
                {/* Status */}
                <div className="flex items-center gap-3">
                    <Badge className={`rounded-full px-4 py-1 font-semibold uppercase text-[10px] tracking-wider ${product.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'} border-none shadow-none`}>
                        {product.is_active ? 'Actif' : 'Masqué'}
                    </Badge>
                    {product.description && (
                        <span className="text-sm text-slate-500">{product.description}</span>
                    )}
                </div>

                {/* Stats Grid */}
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {statsData.map((stat) => (
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
                                    <div className="text-2xl font-semibold text-slate-950 tracking-tight">{stat.value}</div>
                                    <p className="text-sm font-bold text-slate-400 mt-2">{stat.description}</p>
                                </div>
                            </div>
                            <div className="absolute -right-4 -bottom-4 h-32 w-32 bg-slate-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-700" />
                        </div>
                    ))}
                </div>

                {/* Low stock alert */}
                {lowStockItems.length > 0 && (
                    <div className="rounded-md bg-rose-50 border border-rose-200/50 p-6">
                        <p className="text-sm font-semibold text-rose-600">
                            Stock critique dans {lowStockItems.length} emplacement{lowStockItems.length > 1 ? 's' : ''} :
                            {lowStockItems.map(s => ` ${s.depot_name} (${s.quantity})`).join(',')}
                        </p>
                    </div>
                )}

                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Variants */}
                    <div className="rounded-lg bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                        <div className="px-8 py-6 border-b border-slate-100">
                            <h3 className="text-xl font-semibold text-slate-950 tracking-tight">Variantes / Formats</h3>
                            <p className="text-sm font-medium text-slate-400 mt-1">Emballages et prix par format</p>
                        </div>
                        <div className="p-2">
                            {variants.length === 0 ? (
                                <div className="text-center py-12">
                                    <Package className="h-10 w-10 mx-auto text-slate-300" />
                                    <p className="text-sm text-slate-400 mt-3">Aucune variante configurée</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader className="bg-slate-50/50">
                                        <TableRow className="border-none hover:bg-transparent">
                                            <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 pl-6">Emballage</TableHead>
                                            <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">Prix Vente</TableHead>
                                            <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">Consigne</TableHead>
                                            <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right pr-6">Code-barres</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {variants.map((v) => (
                                            <TableRow key={v.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                                <TableCell className="py-4 pl-6">
                                                    <div>
                                                        <p className="font-semibold text-slate-950 text-sm">{v.packaging_name}</p>
                                                        <p className="text-[11px] text-slate-400 font-bold">{v.units_per_case} unité{v.units_per_case > 1 ? 's' : ''}/casier</p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-4 text-right font-semibold text-slate-950">{formatCurrency(Number(v.price))}</TableCell>
                                                <TableCell className="py-4 text-right text-slate-500 font-bold">{formatCurrency(Number(v.deposit_price))}</TableCell>
                                                <TableCell className="py-4 text-right pr-6">
                                                    <span className="font-mono text-xs text-slate-400">{v.barcode || '—'}</span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </div>
                    </div>

                    {/* Stock per depot */}
                    <div className="rounded-lg bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                        <div className="px-8 py-6 border-b border-slate-100">
                            <h3 className="text-xl font-semibold text-slate-950 tracking-tight">Stock par Dépôt</h3>
                            <p className="text-sm font-medium text-slate-400 mt-1">Quantités disponibles</p>
                        </div>
                        <div className="p-2">
                            {stock.length === 0 ? (
                                <div className="text-center py-12">
                                    <Warehouse className="h-10 w-10 mx-auto text-slate-300" />
                                    <p className="text-sm text-slate-400 mt-3">Aucun stock enregistré</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader className="bg-slate-50/50">
                                        <TableRow className="border-none hover:bg-transparent">
                                            <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 pl-6">Dépôt</TableHead>
                                            <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">Quantité</TableHead>
                                            <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">Seuil Alerte</TableHead>
                                            <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right pr-6">Lot</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {stock.map((s) => {
                                            const isLow = Number(s.quantity) <= Number(s.min_stock_alert)
                                            return (
                                                <TableRow key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                                    <TableCell className="py-4 pl-6 font-semibold text-slate-950 text-sm">{s.depot_name}</TableCell>
                                                    <TableCell className={`py-4 text-right font-semibold text-base ${isLow ? 'text-rose-600' : 'text-slate-950'}`}>
                                                        {s.quantity}
                                                    </TableCell>
                                                    <TableCell className="py-4 text-right text-slate-400 font-bold">{s.min_stock_alert}</TableCell>
                                                    <TableCell className="py-4 text-right pr-6">
                                                        <span className="font-mono text-xs text-slate-400">{s.lot_number || '—'}</span>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </div>
                    </div>
                </div>

                {/* Recent movements */}
                <div className="rounded-lg bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                    <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
                        <div>
                            <h3 className="text-xl font-semibold text-slate-950 tracking-tight flex items-center gap-2">
                                <BarChart3 className="h-5 w-5 text-slate-400" />
                                Mouvements Récents
                            </h3>
                            <p className="text-sm font-medium text-slate-400 mt-1">Historique des 20 derniers mouvements</p>
                        </div>
                    </div>
                    <div className="p-2">
                        {movements.length === 0 ? (
                            <div className="text-center py-12">
                                <BarChart3 className="h-10 w-10 mx-auto text-slate-300" />
                                <p className="text-sm text-slate-400 mt-3">Aucun mouvement enregistré</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader className="bg-slate-50/50">
                                    <TableRow className="border-none hover:bg-transparent">
                                        <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 pl-6">Date</TableHead>
                                        <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Type</TableHead>
                                        <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">Quantité</TableHead>
                                        <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Dépôt</TableHead>
                                        <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400 pr-6">Par</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {movements.map((m) => {
                                        const typeInfo = movementTypeLabels[m.movement_type] || { label: m.movement_type, color: 'bg-slate-100 text-slate-600' }
                                        return (
                                            <TableRow key={m.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                                <TableCell className="py-4 pl-6 text-sm text-slate-500 font-bold">
                                                    {new Date(m.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </TableCell>
                                                <TableCell className="py-4">
                                                    <Badge className={`rounded-full px-3 py-0.5 font-semibold uppercase text-[10px] tracking-wider border-none shadow-none ${typeInfo.color}`}>
                                                        {typeInfo.label}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className={`py-4 text-right font-semibold text-base ${Number(m.quantity) > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {Number(m.quantity) > 0 ? '+' : ''}{m.quantity}
                                                </TableCell>
                                                <TableCell className="py-4 font-bold text-slate-700 text-sm">{m.depot_name}</TableCell>
                                                <TableCell className="py-4 pr-6 text-sm text-slate-400">{m.created_by_name || '—'}</TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
