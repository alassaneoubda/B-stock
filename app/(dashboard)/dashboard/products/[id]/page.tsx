import type { ReactNode } from 'react'
import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { notFound } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    AlertTriangle,
    ArrowLeft,
    BarChart3,
    BoxesIcon,
    Edit,
    Package,
    Tag,
    TrendingUp,
    Warehouse,
} from 'lucide-react'
import Link from 'next/link'
import { isUuid } from '@/lib/tenant'
import { formatDateShort, formatMoney, formatNumber } from '@/lib/format'
import { DeleteProductButton } from './delete-product-button'

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

// Pas de try/catch : une panne SQL doit afficher la page d'erreur, pas des listes vides.
async function getProduct(productId: string, companyId: string): Promise<ProductDetail | null> {
    const products = await sql`
        SELECT * FROM products
        WHERE id = ${productId} AND company_id = ${companyId}
    `
    return (products[0] as ProductDetail) || null
}

async function getVariants(productId: string): Promise<Variant[]> {
    const variants = await sql`
        SELECT pv.*, pt.name as packaging_name, pt.units_per_case, pt.deposit_price
        FROM product_variants pv
        LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
        WHERE pv.product_id = ${productId}
        ORDER BY pt.name
    `
    return variants as Variant[]
}

async function getStock(productId: string): Promise<StockItem[]> {
    const stock = await sql`
        SELECT s.*, d.name as depot_name, d.id as depot_id
        FROM stock s
        JOIN depots d ON s.depot_id = d.id
        JOIN product_variants pv ON s.product_variant_id = pv.id
        WHERE pv.product_id = ${productId}
        ORDER BY d.name
    `
    return stock as StockItem[]
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
}

type Tone = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

const movementTypeLabels: Record<string, { label: string; tone: Tone }> = {
    purchase: { label: 'Achat', tone: 'success' },
    sale: { label: 'Vente', tone: 'brand' },
    return: { label: 'Retour', tone: 'warning' },
    damage: { label: 'Casse', tone: 'danger' },
    adjustment: { label: 'Ajustement', tone: 'default' },
    transfer: { label: 'Transfert', tone: 'info' },
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-4 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right font-medium text-foreground">{children}</span>
        </div>
    )
}

/** État vide compact dans un panneau (composant serveur, sans icône passée en prop client). */
function PanelEmpty({ icon: Icon, label }: { icon: typeof Package; label: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm text-muted-foreground">{label}</p>
        </div>
    )
}

export default async function ProductDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''
    if (!isUuid(id)) notFound()

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
        ? formatNumber(Number(((margin / Number(product.purchase_price)) * 100).toFixed(1)))
        : '—'

    const subtitle = [product.category || 'Non classé', product.brand, product.sku].filter(Boolean).join(' · ')

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader title="Fiche produit" description={product.name} />

            <PageShell>
                <div className="space-y-4">
                    <Button variant="ghost" size="sm" asChild className="-ml-2">
                        <Link href="/dashboard/products">
                            <ArrowLeft aria-hidden="true" />
                            Produits
                        </Link>
                    </Button>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-3">
                                <h2 className="text-2xl font-semibold tracking-tight text-foreground">{product.name}</h2>
                                <StatusBadge label={product.is_active ? 'Actif' : 'Masqué'} tone={product.is_active ? 'success' : 'default'} />
                            </div>
                            <p className="text-sm text-muted-foreground">{subtitle}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <DeleteProductButton productId={id} productName={product.name} />
                            <Button asChild>
                                <Link href={`/dashboard/products/${id}/edit`}>
                                    <Edit aria-hidden="true" />
                                    Modifier
                                </Link>
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <StatCard
                        label="Stock total"
                        value={`${formatNumber(totalStock)} ${product.base_unit}`}
                        hint={`${stock.length} emplacement${stock.length > 1 ? 's' : ''}`}
                        icon={Warehouse}
                        tone={totalStock <= 0 ? 'danger' : totalStock < 10 ? 'warning' : 'success'}
                    />
                    <StatCard label="Variantes" value={formatNumber(variants.length)} hint="Formats disponibles" icon={BoxesIcon} />
                    <StatCard
                        label="Prix de vente"
                        value={formatMoney(product.selling_price)}
                        hint={`Achat : ${formatMoney(product.purchase_price)}`}
                        icon={Tag}
                        tone="info"
                    />
                    <StatCard
                        label="Marge unitaire"
                        value={formatMoney(margin)}
                        hint={`${marginPct} % sur le prix d’achat`}
                        icon={TrendingUp}
                        tone={margin > 0 ? 'success' : 'danger'}
                    />
                </div>

                {lowStockItems.length > 0 && (
                    <div role="status" className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                        <p className="text-sm">
                            <span className="font-medium text-destructive">
                                Stock critique dans {lowStockItems.length} emplacement{lowStockItems.length > 1 ? 's' : ''}
                            </span>
                            <span className="text-muted-foreground">
                                {' '}— {lowStockItems.map(s => `${s.depot_name} (${formatNumber(s.quantity)})`).join(', ')}
                            </span>
                        </p>
                    </div>
                )}

                <div className="grid gap-6 lg:grid-cols-3">
                    <div className="space-y-6 lg:col-span-2">
                        <Panel title="Variantes et formats" description="Emballages et prix par format">
                            {variants.length === 0 ? (
                                <PanelEmpty icon={Package} label="Aucune variante configurée" />
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="pl-5">Emballage</TableHead>
                                                <TableHead className="text-right">Prix de vente</TableHead>
                                                <TableHead className="text-right">Consigne</TableHead>
                                                <TableHead className="pr-5 text-right">Code-barres</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {variants.map((v) => (
                                                <TableRow key={v.id}>
                                                    <TableCell className="pl-5">
                                                        <p className="text-sm font-medium text-foreground">{v.packaging_name}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {v.units_per_case} unité{v.units_per_case > 1 ? 's' : ''}/casier
                                                        </p>
                                                    </TableCell>
                                                    <TableCell className="tabular text-right text-sm font-medium text-foreground">{formatMoney(v.price)}</TableCell>
                                                    <TableCell className="tabular text-right text-sm text-muted-foreground">{formatMoney(v.deposit_price)}</TableCell>
                                                    <TableCell className="pr-5 text-right">
                                                        <span className="font-mono text-xs text-muted-foreground">{v.barcode || '—'}</span>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </Panel>

                        <Panel title="Stock par dépôt" description="Quantités disponibles">
                            {stock.length === 0 ? (
                                <PanelEmpty icon={Warehouse} label="Aucun stock enregistré" />
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="pl-5">Dépôt</TableHead>
                                                <TableHead className="text-right">Quantité</TableHead>
                                                <TableHead className="text-right">Seuil d’alerte</TableHead>
                                                <TableHead>Niveau</TableHead>
                                                <TableHead className="pr-5 text-right">Lot</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {stock.map((s) => {
                                                const qty = Number(s.quantity)
                                                const isLow = qty <= Number(s.min_stock_alert)
                                                return (
                                                    <TableRow key={s.id}>
                                                        <TableCell className="pl-5 text-sm font-medium text-foreground">{s.depot_name}</TableCell>
                                                        <TableCell className={`tabular text-right text-sm font-medium ${isLow ? 'text-destructive' : 'text-foreground'}`}>
                                                            {formatNumber(s.quantity)}
                                                        </TableCell>
                                                        <TableCell className="tabular text-right text-sm text-muted-foreground">{formatNumber(s.min_stock_alert)}</TableCell>
                                                        <TableCell>
                                                            {qty <= 0 ? (
                                                                <StatusBadge label="Rupture" tone="danger" />
                                                            ) : isLow ? (
                                                                <StatusBadge label="Stock bas" tone="warning" />
                                                            ) : (
                                                                <StatusBadge label="OK" tone="success" />
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="pr-5 text-right">
                                                            <span className="font-mono text-xs text-muted-foreground">{s.lot_number || '—'}</span>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </Panel>

                        <Panel title="Mouvements récents" description="Les 20 derniers mouvements de stock">
                            {movements.length === 0 ? (
                                <PanelEmpty icon={BarChart3} label="Aucun mouvement enregistré" />
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="pl-5">Date</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead className="text-right">Quantité</TableHead>
                                                <TableHead>Dépôt</TableHead>
                                                <TableHead className="pr-5">Par</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {movements.map((m) => {
                                                const typeInfo = movementTypeLabels[m.movement_type] || { label: m.movement_type, tone: 'default' as Tone }
                                                const positive = Number(m.quantity) > 0
                                                return (
                                                    <TableRow key={m.id}>
                                                        <TableCell className="tabular pl-5 text-sm text-muted-foreground">
                                                            {formatDateShort(m.created_at)}
                                                        </TableCell>
                                                        <TableCell>
                                                            <StatusBadge label={typeInfo.label} tone={typeInfo.tone} />
                                                        </TableCell>
                                                        <TableCell className={`tabular text-right text-sm font-medium ${positive ? 'text-success' : 'text-destructive'}`}>
                                                            {positive ? '+' : ''}{formatNumber(m.quantity)}
                                                        </TableCell>
                                                        <TableCell className="text-sm text-foreground">{m.depot_name}</TableCell>
                                                        <TableCell className="pr-5 text-sm text-muted-foreground">{m.created_by_name || '—'}</TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </Panel>
                    </div>

                    <div className="space-y-6">
                        <Panel title="Résumé" bodyClassName="space-y-3 p-5">
                            <SummaryRow label="Statut">{product.is_active ? 'Actif' : 'Masqué'}</SummaryRow>
                            <SummaryRow label="SKU"><span className="font-mono text-xs">{product.sku || '—'}</span></SummaryRow>
                            <SummaryRow label="Catégorie">{product.category || 'Non classé'}</SummaryRow>
                            <SummaryRow label="Marque">{product.brand || '—'}</SummaryRow>
                            <SummaryRow label="Unité de base">{product.base_unit}</SummaryRow>
                            <div className="border-t border-border" />
                            <SummaryRow label="Prix d’achat"><span className="tabular">{formatMoney(product.purchase_price)}</span></SummaryRow>
                            <SummaryRow label="Prix de vente"><span className="tabular">{formatMoney(product.selling_price)}</span></SummaryRow>
                            <SummaryRow label="Marge unitaire">
                                <span className={`tabular ${margin > 0 ? 'text-success' : 'text-destructive'}`}>{formatMoney(margin)}</span>
                            </SummaryRow>
                            <SummaryRow label="Taux de marge"><span className="tabular">{marginPct} %</span></SummaryRow>
                            <div className="border-t border-border" />
                            <SummaryRow label="Créé le"><span className="tabular">{formatDateShort(product.created_at)}</span></SummaryRow>
                            <SummaryRow label="Modifié le"><span className="tabular">{formatDateShort(product.updated_at)}</span></SummaryRow>
                        </Panel>

                        {product.description && (
                            <Panel title="Description" bodyClassName="p-5">
                                <p className="whitespace-pre-line text-sm text-muted-foreground">{product.description}</p>
                            </Panel>
                        )}
                    </div>
                </div>
            </PageShell>
        </div>
    )
}


