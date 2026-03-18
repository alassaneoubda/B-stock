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
    Phone,
    MapPin,
    ShoppingCart,
    Package,
    CreditCard,
    Plus,
    History,
    AlertTriangle,
} from 'lucide-react'
import Link from 'next/link'
import { CollectDebtDialog } from '@/components/dashboard/collect-debt-dialog'

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

async function getClientDetail(clientId: string, companyId: string): Promise<ClientDetail | null> {
    try {
        const clients = await sql`
      SELECT
        c.*,
        COALESCE(
          (SELECT balance FROM client_accounts ca WHERE ca.client_id = c.id AND ca.account_type = 'product'),
          0
        ) as product_balance,
        COALESCE(
          (SELECT balance FROM client_accounts ca WHERE ca.client_id = c.id AND ca.account_type = 'packaging'),
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
    } catch {
        return null
    }
}

async function getClientOrders(clientId: string) {
    try {
        const orders = await sql`
      SELECT id, order_number, subtotal, packaging_total, total_amount,
             paid_amount, paid_amount_products, paid_amount_packaging,
             payment_method, status, created_at
      FROM sales_orders
      WHERE client_id = ${clientId}
      ORDER BY created_at DESC
      LIMIT 10
    `
        return orders
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

const typeLabels: Record<string, string> = {
    retail: 'Détaillant',
    wholesale: 'Grossiste',
    restaurant: 'Restaurant/Maquis',
    bar: 'Bar',
    subdepot: 'Sous-dépôt',
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: 'En attente', variant: 'secondary' },
    confirmed: { label: 'Confirmée', variant: 'default' },
    delivered: { label: 'Livrée', variant: 'default' },
    cancelled: { label: 'Annulée', variant: 'destructive' },
}

export default async function ClientDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const session = await auth()
    const companyId = session?.user?.companyId || ''

    const [client, orders] = await Promise.all([
        getClientDetail(id, companyId),
        getClientOrders(id),
    ])

    if (!client) notFound()

    const productBalance = Number(client.product_balance)
    const packagingBalance = Number(client.packaging_balance)
    const creditUsed = productBalance < 0 ? Math.abs(productBalance) : 0
    const packagingDebt = packagingBalance < 0 ? Math.abs(packagingBalance) : 0
    const creditPct = client.credit_limit > 0 ? Math.min((creditUsed / Number(client.credit_limit)) * 100, 100) : 0
    const packagingPct = client.packaging_credit_limit > 0 ? Math.min((packagingDebt / Number(client.packaging_credit_limit)) * 100, 100) : 0

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader
                title={client.name}
                description={`${typeLabels[client.client_type] || client.client_type} — ${client.total_orders} commande${Number(client.total_orders) > 1 ? 's' : ''}`}
                actions={
                    <div className="flex gap-2 flex-wrap">
                        <Button variant="outline" asChild>
                            <Link href={`/dashboard/clients/${id}/edit`}>
                                <Edit className="h-4 w-4 mr-2" />
                                Modifier
                            </Link>
                        </Button>
                        {(creditUsed > 0 || packagingDebt > 0) && (
                            <CollectDebtDialog
                                clientId={id}
                                clientName={client.name}
                                productDebt={creditUsed}
                                packagingDebt={packagingDebt}
                            />
                        )}
                        <Button asChild>
                            <Link href={`/dashboard/sales/new?client=${id}`}>
                                <Plus className="h-4 w-4 mr-2" />
                                Nouvelle vente
                            </Link>
                        </Button>
                    </div>
                }
            />

            <main className="flex-1 p-4 lg:p-6 space-y-6">
                {/* Total debt banner */}
                {(creditUsed > 0 || packagingDebt > 0) && (
                    <Card className="border-rose-200/60 bg-gradient-to-r from-rose-50 to-amber-50">
                        <CardContent className="p-6">
                            <div className="grid grid-cols-3 gap-6">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wider text-rose-400">Dette Produits</p>
                                    <p className="text-2xl font-semibold text-rose-600">{formatCurrency(creditUsed)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wider text-amber-400">Dette Emballages</p>
                                    <p className="text-2xl font-semibold text-amber-600">{formatCurrency(packagingDebt)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Dette Totale</p>
                                    <p className="text-2xl font-semibold text-slate-950">{formatCurrency(creditUsed + packagingDebt)}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Info client */}
                    <Card className="lg:col-span-1">
                        <CardHeader>
                            <CardTitle className="text-base">Informations</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Badge variant={client.is_active ? 'default' : 'secondary'}>
                                    {client.is_active ? 'Actif' : 'Inactif'}
                                </Badge>
                                <Badge variant="outline">{typeLabels[client.client_type] || client.client_type}</Badge>
                            </div>

                            {client.phone && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <a href={`tel:${client.phone}`} className="hover:text-accent transition-colors">
                                        {client.phone}
                                    </a>
                                </div>
                            )}
                            {client.address && (
                                <div className="flex items-start gap-2 text-sm">
                                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                    <span className="text-muted-foreground">{client.address}</span>
                                </div>
                            )}
                            {client.zone && (
                                <div className="text-sm">
                                    <span className="text-muted-foreground">Zone : </span>
                                    <span className="font-medium">{client.zone}</span>
                                </div>
                            )}
                            {client.notes && (
                                <div className="pt-2 border-t border-border/50">
                                    <p className="text-xs text-muted-foreground">{client.notes}</p>
                                </div>
                            )}
                            <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
                                Client depuis le {new Date(client.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Comptes */}
                    <div className="lg:col-span-2 space-y-4">
                        {/* Compte produits */}
                        <Card className={creditPct >= 90 ? 'border-destructive/40' : ''}>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                                        Compte produits
                                    </CardTitle>
                                    {creditPct >= 90 && (
                                        <AlertTriangle className="h-4 w-4 text-destructive" />
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Solde</p>
                                        <p className={`text-xl font-bold ${productBalance < 0 ? 'text-destructive' : 'text-success'}`}>
                                            {productBalance < 0 ? `-${formatCurrency(Math.abs(productBalance))}` : formatCurrency(productBalance)}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {productBalance < 0 ? 'Doit' : 'Crédit'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Plafond crédit</p>
                                        <p className="text-xl font-bold">{formatCurrency(Number(client.credit_limit))}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Utilisé</p>
                                        <p className={`text-xl font-bold ${creditPct >= 90 ? 'text-destructive' : ''}`}>
                                            {creditPct.toFixed(0)}%
                                        </p>
                                        <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${creditPct >= 90 ? 'bg-destructive' : 'bg-accent'}`}
                                                style={{ width: `${creditPct}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Compte emballages */}
                        <Card className={packagingPct >= 90 ? 'border-warning/40' : ''}>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Package className="h-4 w-4 text-muted-foreground" />
                                    Compte emballages
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Solde emballages</p>
                                        <p className={`text-xl font-bold ${packagingBalance < 0 ? 'text-warning-foreground' : 'text-success'}`}>
                                            {packagingBalance < 0 ? `-${formatCurrency(Math.abs(packagingBalance))}` : formatCurrency(packagingBalance)}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {packagingBalance < 0 ? 'Casiers dus' : 'Crédit'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Plafond emballages</p>
                                        <p className="text-xl font-bold">{formatCurrency(Number(client.packaging_credit_limit))}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Utilisé</p>
                                        <p className={`text-xl font-bold ${packagingPct >= 90 ? 'text-warning-foreground' : ''}`}>
                                            {packagingPct.toFixed(0)}%
                                        </p>
                                        <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${packagingPct >= 90 ? 'bg-warning' : 'bg-accent'}`}
                                                style={{ width: `${packagingPct}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Historique des commandes */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <History className="h-4 w-4" />
                                Dernières commandes
                            </CardTitle>
                            <Button variant="outline" size="sm" asChild>
                                <Link href={`/dashboard/sales?client=${id}`}>
                                    Voir tout
                                </Link>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {orders.length === 0 ? (
                            <div className="text-center py-8">
                                <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground/40" />
                                <p className="text-sm text-muted-foreground mt-3">Aucune commande pour ce client</p>
                                <Button size="sm" className="mt-3" asChild>
                                    <Link href={`/dashboard/sales/new?client=${id}`}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Créer une vente
                                    </Link>
                                </Button>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Commande</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Paiement</TableHead>
                                        <TableHead className="text-right">Montant</TableHead>
                                        <TableHead className="text-right">Reste</TableHead>
                                        <TableHead>Statut</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {orders.map((order: any) => {
                                        const remaining = Number(order.total_amount) - Number(order.paid_amount)
                                        const status = statusConfig[order.status] || { label: order.status, variant: 'secondary' as const }
                                        return (
                                            <TableRow key={order.id}>
                                                <TableCell>
                                                    <Link href={`/dashboard/sales/${order.id}`} className="font-mono text-sm font-medium hover:text-accent transition-colors">
                                                        {order.order_number}
                                                    </Link>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {new Date(order.created_at).toLocaleDateString('fr-FR')}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="text-xs">
                                                        {order.payment_method === 'cash' ? 'Espèces' :
                                                            order.payment_method === 'mobile_money' ? 'Mobile Money' :
                                                                order.payment_method === 'credit' ? 'Crédit' : order.payment_method || '-'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-medium">
                                                    {formatCurrency(Number(order.total_amount))}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <span className={remaining > 0 ? 'text-destructive font-medium' : 'text-success'}>
                                                        {remaining > 0 ? formatCurrency(remaining) : '✓'}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={status.variant}>{status.label}</Badge>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}
