import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { notFound } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel, StatusBadge } from '@/components/app/blocks'
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
    ArrowLeft,
    Edit,
    Phone,
    MapPin,
    ShoppingCart,
    Plus,
    AlertTriangle,
    ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { CollectDebtDialog } from '@/components/dashboard/collect-debt-dialog'
import { isUuid } from '@/lib/tenant'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { balanceLabel } from '../balance-text'

interface ClientDetail {
    id: string
    name: string
    contact_name: string | null
    phone: string | null
    email: string | null
    address: string | null
    zone: string | null
    client_type: string
    credit_limit: number
    packaging_credit_limit: number
    quality_rating: number | null
    notes: string | null
    is_active: boolean
    product_balance: number
    packaging_balance: number
    total_orders: number
    created_at: string
}

// Pas de try/catch : une panne de base doit afficher l'écran d'erreur, pas « introuvable ».
async function getClientDetail(clientId: string, companyId: string): Promise<ClientDetail | null> {
    const clients = await sql`
      SELECT
        c.*,
        COALESCE(
          (SELECT SUM(balance) FROM client_accounts ca WHERE ca.client_id = c.id AND ca.account_type = 'product'),
          0
        ) as product_balance,
        COALESCE(
          (SELECT SUM(balance) FROM client_accounts ca WHERE ca.client_id = c.id AND ca.account_type = 'packaging'),
          0
        ) as packaging_balance,
        COALESCE(
          (SELECT COUNT(*) FROM sales_orders so WHERE so.client_id = c.id AND so.status != 'cancelled'),
          0
        ) as total_orders
      FROM clients c
      WHERE c.id = ${clientId} AND c.company_id = ${companyId}
    `
    return (clients[0] as ClientDetail) || null
}

async function getClientOrders(clientId: string, companyId: string) {
    return sql`
      SELECT id, order_number, subtotal, packaging_total, total_amount,
             paid_amount, paid_amount_products, paid_amount_packaging,
             payment_method, status, created_at
      FROM sales_orders
      WHERE client_id = ${clientId} AND company_id = ${companyId}
      ORDER BY created_at DESC
      LIMIT 10
    `
}

const formatCurrency = formatMoney

const paymentLabels: Record<string, string> = {
    cash: 'Espèces',
    mobile_money: 'Mobile Money',
    credit: 'Crédit',
    mixed: 'Mixte',
}

const typeLabels: Record<string, string> = {
    retail: 'Détaillant',
    wholesale: 'Grossiste',
    restaurant: 'Restaurant/Maquis',
    bar: 'Bar',
    subdepot: 'Sous-dépôt',
}

/** Jauge d'utilisation d'un plafond (libellé chiffré toujours affiché). */
function UsageBar({ pct, alertClass }: { pct: number; alertClass: string }) {
    return (
        <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Utilisation du plafond"
        >
            <div
                className={cn('h-full rounded-full', pct >= 90 ? alertClass : 'bg-brand')}
                style={{ width: `${pct}%` }}
            />
        </div>
    )
}

export default async function ClientDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''
    if (!isUuid(id)) notFound()

    const [client, orders] = await Promise.all([
        getClientDetail(id, companyId),
        getClientOrders(id, companyId),
    ])

    if (!client) notFound()

    const productBalance = Number(client.product_balance)
    const packagingBalance = Number(client.packaging_balance)
    const creditUsed = productBalance < 0 ? Math.abs(productBalance) : 0
    const packagingDebt = packagingBalance < 0 ? Math.abs(packagingBalance) : 0
    const creditPct = client.credit_limit > 0 ? Math.min((creditUsed / Number(client.credit_limit)) * 100, 100) : 0
    const packagingPct = client.packaging_credit_limit > 0 ? Math.min((packagingDebt / Number(client.packaging_credit_limit)) * 100, 100) : 0
    const productLabel = balanceLabel(productBalance)
    const packagingLabel = balanceLabel(packagingBalance)
    const typeLabel = typeLabels[client.client_type] || client.client_type
    const hasDebt = creditUsed > 0 || packagingDebt > 0

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title={client.name}
                description={`${typeLabel} — ${formatNumber(client.total_orders)} commande${Number(client.total_orders) > 1 ? 's' : ''}`}
            />

            <PageShell>
                <div className="space-y-3">
                    <Button variant="ghost" size="sm" asChild className="-ml-2">
                        <Link href="/dashboard/clients">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            Clients
                        </Link>
                    </Button>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-3">
                                <h2 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                                    {client.name}
                                </h2>
                                <StatusBadge
                                    label={client.is_active ? 'Actif' : 'Inactif'}
                                    tone={client.is_active ? 'success' : 'default'}
                                />
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {typeLabel}
                                {client.zone ? ` · ${client.zone}` : ''}
                                {` · ${formatNumber(client.total_orders)} commande${Number(client.total_orders) > 1 ? 's' : ''}`}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" asChild>
                                <Link href={`/dashboard/clients/${id}/edit`}>
                                    <Edit className="h-4 w-4" aria-hidden="true" />
                                    Modifier
                                </Link>
                            </Button>
                            <Button variant={hasDebt ? 'default' : 'brand'} asChild>
                                <Link href={`/dashboard/sales/new?client=${id}`}>
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                    Nouvelle vente
                                </Link>
                            </Button>
                            {hasDebt && (
                                <CollectDebtDialog
                                    clientId={id}
                                    clientName={client.name}
                                    productDebt={creditUsed}
                                    packagingDebt={packagingDebt}
                                />
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    {/* Contenu principal (2/3) */}
                    <div className="space-y-4 lg:col-span-2">
                        <div className="grid gap-4 md:grid-cols-2">
                            {/* Compte produits */}
                            <Panel
                                title="Compte produits"
                                action={creditPct >= 90 ? <StatusBadge label="Plafond presque atteint" tone="danger" /> : undefined}
                                bodyClassName="space-y-4 p-5"
                            >
                                <div>
                                    <p className={cn(
                                        'tabular text-2xl font-semibold tracking-tight',
                                        productLabel.tone === 'debt' ? 'text-destructive' : productLabel.tone === 'credit' ? 'text-success' : 'text-foreground'
                                    )}>
                                        {productLabel.text}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {productLabel.tone === 'debt' ? 'Le client vous doit ce montant' : productLabel.tone === 'credit' ? 'Avance du client' : 'Aucune dette'}
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex items-baseline justify-between text-xs">
                                        <span className="text-muted-foreground">
                                            Plafond <span className="tabular text-foreground">{formatCurrency(Number(client.credit_limit))}</span>
                                        </span>
                                        <span className={cn('tabular font-medium', creditPct >= 90 ? 'text-destructive' : 'text-foreground')}>
                                            {creditPct.toFixed(0)} % utilisé
                                        </span>
                                    </div>
                                    <UsageBar pct={creditPct} alertClass="bg-destructive" />
                                </div>
                            </Panel>

                            {/* Compte emballages */}
                            <Panel
                                title="Compte emballages"
                                action={packagingPct >= 90 ? <StatusBadge label="Plafond presque atteint" tone="warning" /> : undefined}
                                bodyClassName="space-y-4 p-5"
                            >
                                <div>
                                    <p className={cn(
                                        'tabular text-2xl font-semibold tracking-tight',
                                        packagingLabel.tone === 'debt' ? 'text-warning-foreground' : packagingLabel.tone === 'credit' ? 'text-success' : 'text-foreground'
                                    )}>
                                        {packagingLabel.text}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {packagingLabel.tone === 'debt' ? 'Consignes dues' : packagingLabel.tone === 'credit' ? 'Avance du client' : 'Aucune consigne due'}
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex items-baseline justify-between text-xs">
                                        <span className="text-muted-foreground">
                                            Plafond <span className="tabular text-foreground">{formatCurrency(Number(client.packaging_credit_limit))}</span>
                                        </span>
                                        <span className={cn('tabular font-medium', packagingPct >= 90 ? 'text-warning-foreground' : 'text-foreground')}>
                                            {packagingPct.toFixed(0)} % utilisé
                                        </span>
                                    </div>
                                    <UsageBar pct={packagingPct} alertClass="bg-warning" />
                                </div>
                            </Panel>
                        </div>

                        {/* Historique des commandes */}
                        <Panel
                            title="Dernières commandes"
                            description="Les 10 plus récentes"
                            action={orders.length > 0 ? { label: 'Voir tout', href: `/dashboard/sales?client=${id}` } : undefined}
                        >
                            {orders.length === 0 ? (
                                <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                        <ShoppingCart className="h-5 w-5" aria-hidden="true" />
                                    </div>
                                    <p className="text-sm text-muted-foreground">Aucune commande pour ce client.</p>
                                    <Button size="sm" variant="outline" asChild>
                                        <Link href={`/dashboard/sales/new?client=${id}`}>
                                            <Plus className="h-4 w-4" aria-hidden="true" />
                                            Créer une vente
                                        </Link>
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    <div className="hidden overflow-x-auto md:block">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="hover:bg-transparent">
                                                    <TableHead className="pl-5">Commande</TableHead>
                                                    <TableHead>Date</TableHead>
                                                    <TableHead>Paiement</TableHead>
                                                    <TableHead className="text-right">Montant</TableHead>
                                                    <TableHead className="text-right">Reste</TableHead>
                                                    <TableHead className="pr-5">Statut</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {orders.map((order: any) => {
                                                    const remaining = Number(order.total_amount) - Number(order.paid_amount)
                                                    return (
                                                        <TableRow key={order.id}>
                                                            <TableCell className="pl-5">
                                                                <Link
                                                                    href={`/dashboard/sales/${order.id}`}
                                                                    className="rounded-sm font-mono text-sm font-medium text-foreground transition-colors hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                                >
                                                                    {order.order_number}
                                                                </Link>
                                                            </TableCell>
                                                            <TableCell className="tabular text-sm text-muted-foreground">
                                                                {formatDate(order.created_at)}
                                                            </TableCell>
                                                            <TableCell className="text-sm text-foreground">
                                                                {paymentLabels[order.payment_method] || order.payment_method || '—'}
                                                            </TableCell>
                                                            <TableCell className="tabular text-right text-sm font-medium">
                                                                {formatCurrency(Number(order.total_amount))}
                                                            </TableCell>
                                                            <TableCell className="tabular text-right text-sm">
                                                                {order.status === 'cancelled' ? (
                                                                    <span className="text-muted-foreground">—</span>
                                                                ) : remaining > 0 ? (
                                                                    <span className="font-medium text-destructive">{formatCurrency(remaining)}</span>
                                                                ) : (
                                                                    <span className="text-success">Soldé</span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="pr-5">
                                                                <StatusBadge status={order.status} />
                                                            </TableCell>
                                                        </TableRow>
                                                    )
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>

                                    <ul className="divide-y divide-border md:hidden">
                                        {orders.map((order: any) => {
                                            const remaining = Number(order.total_amount) - Number(order.paid_amount)
                                            return (
                                                <li key={order.id}>
                                                    <Link
                                                        href={`/dashboard/sales/${order.id}`}
                                                        className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <p className="truncate font-mono text-sm font-medium text-foreground">{order.order_number}</p>
                                                                <StatusBadge status={order.status} />
                                                            </div>
                                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                                {formatDate(order.created_at)} · {paymentLabels[order.payment_method] || order.payment_method || '—'}
                                                            </p>
                                                        </div>
                                                        <div className="shrink-0 text-right">
                                                            <p className="tabular text-sm font-medium text-foreground">{formatCurrency(Number(order.total_amount))}</p>
                                                            {order.status !== 'cancelled' && (
                                                                <p className={cn('tabular text-xs', remaining > 0 ? 'text-destructive' : 'text-success')}>
                                                                    {remaining > 0 ? `Reste ${formatCurrency(remaining)}` : 'Soldé'}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                                    </Link>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                </>
                            )}
                        </Panel>
                    </div>

                    {/* Résumé (1/3) */}
                    <div className="space-y-4">
                        {hasDebt && (
                            <Panel
                                title="Dette totale"
                                action={<AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />}
                                bodyClassName="space-y-3 p-5"
                            >
                                <p className="tabular text-2xl font-semibold tracking-tight text-foreground">
                                    {formatCurrency(creditUsed + packagingDebt)}
                                </p>
                                <dl className="space-y-2 text-sm">
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Produits</dt>
                                        <dd className="tabular font-medium text-destructive">{formatCurrency(creditUsed)}</dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Emballages</dt>
                                        <dd className="tabular font-medium text-warning-foreground">{formatCurrency(packagingDebt)}</dd>
                                    </div>
                                </dl>
                            </Panel>
                        )}

                        <Panel title="Informations" bodyClassName="divide-y divide-border">
                            <dl className="space-y-3 p-5 text-sm">
                                <div className="flex justify-between gap-3">
                                    <dt className="text-muted-foreground">Type</dt>
                                    <dd className="text-right font-medium text-foreground">{typeLabel}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="text-muted-foreground">Zone</dt>
                                    <dd className="text-right font-medium text-foreground">{client.zone || '—'}</dd>
                                </div>
                                {client.contact_name && (
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Contact</dt>
                                        <dd className="text-right font-medium text-foreground">{client.contact_name}</dd>
                                    </div>
                                )}
                                {client.phone && (
                                    <div className="flex items-center justify-between gap-3">
                                        <dt className="flex items-center gap-1.5 text-muted-foreground">
                                            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                                            Téléphone
                                        </dt>
                                        <dd>
                                            <a
                                                href={`tel:${client.phone}`}
                                                className="tabular rounded-sm font-medium text-foreground transition-colors hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {client.phone}
                                            </a>
                                        </dd>
                                    </div>
                                )}
                                {client.address && (
                                    <div className="space-y-1">
                                        <dt className="flex items-center gap-1.5 text-muted-foreground">
                                            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                                            Adresse
                                        </dt>
                                        <dd className="text-foreground">{client.address}</dd>
                                    </div>
                                )}
                            </dl>
                            {client.notes && (
                                <div className="space-y-1 p-5">
                                    <p className="text-xs font-medium text-muted-foreground">Notes</p>
                                    <p className="whitespace-pre-line text-sm text-foreground">{client.notes}</p>
                                </div>
                            )}
                            <p className="px-5 py-3 text-xs text-muted-foreground">
                                Client depuis le {formatDate(client.created_at)}
                            </p>
                        </Panel>
                    </div>
                </div>
            </PageShell>
        </div>
    )
}
