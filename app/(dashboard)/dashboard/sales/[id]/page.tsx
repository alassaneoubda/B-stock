'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import Link from 'next/link'
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
import { ArrowLeft, FileText, Loader2, SearchX } from 'lucide-react'
import { apiFetch, ApiError, toastError, toastWarnings } from '@/lib/api-client'
import { formatDateShort, formatDateTime, formatMoney, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'

interface SaleDetail {
    id: string
    order_number: string
    client_name: string
    client_phone: string | null
    client_address: string | null
    client_type: string | null
    depot_name: string | null
    created_by_name: string | null
    status: string
    order_source: string | null
    subtotal: number
    packaging_total: number
    total_amount: number
    paid_amount: number
    paid_amount_products: number
    paid_amount_packaging: number
    payment_method: string | null
    notes: string | null
    created_at: string
    items: Array<{
        id: string
        product_name: string
        brand: string | null
        packaging_name: string | null
        quantity: number
        unit_price: number
        total_price: number
        lot_number: string | null
    }>
    packagingItems: Array<{
        id: string
        packaging_name: string
        quantity_out: number
        quantity_in: number
        unit_price: number
    }>
    payments: Array<{
        id: string
        amount: number
        payment_method: string
        status: string
        reference: string | null
        received_by_name: string | null
        created_at: string
    }>
}

const paymentMethodLabels: Record<string, string> = {
    cash: 'Espèces',
    mobile_money: 'Mobile Money',
    credit: 'Crédit',
    mixed: 'Mixte',
    bank_transfer: 'Virement',
    check: 'Chèque',
}

export default function SaleDetailPage() {
    const params = useParams()
    const router = useRouter()
    const [sale, setSale] = useState<SaleDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<'not_found' | 'error' | null>(null)

    const fetchSale = useCallback(async () => {
        setLoading(true)
        setLoadError(null)
        try {
            const data = await apiFetch(`/api/sales/${params.id}`)
            setSale(data.data)
        } catch (error) {
            setLoadError(error instanceof ApiError && error.status === 404 ? 'not_found' : 'error')
        } finally {
            setLoading(false)
        }
    }, [params.id])

    useEffect(() => {
        fetchSale()
    }, [fetchSale])

    const [updating, setUpdating] = useState(false)

    async function updateStatus(newStatus: string) {
        if (updating) return
        setUpdating(true)
        try {
            const data = await apiFetch(`/api/sales/${params.id}`, {
                method: 'PATCH',
                body: { status: newStatus },
            })
            setSale((prev) => prev ? { ...prev, status: newStatus } : prev)
            toast.success(data.message || 'Statut mis à jour')
            toastWarnings(data.warnings)
            if (newStatus === 'cancelled') {
                router.refresh()
                fetchSale()
            }
        } catch (e) {
            toastError(e)
        } finally {
            setUpdating(false)
        }
    }


    if (loading && !sale) {
        return <PageSkeleton />
    }

    if (loadError === 'error') {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Vente" />
                <PageShell>
                    <ErrorState title="Impossible de charger la vente" onRetry={fetchSale} />
                </PageShell>
            </div>
        )
    }

    if (!sale) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Vente" />
                <PageShell>
                    <EmptyState
                        icon={SearchX}
                        title="Vente introuvable"
                        description="Cette vente n’existe pas ou a été supprimée."
                        action={{ label: 'Retour aux ventes', href: '/dashboard/sales' }}
                    />
                </PageShell>
            </div>
        )
    }

    const remaining = Number(sale.total_amount) - Number(sale.paid_amount)
    const remainingProducts = Number(sale.subtotal) - Number(sale.paid_amount_products || 0)
    const remainingPackaging = Number(sale.packaging_total) - Number(sale.paid_amount_packaging || 0)
    const paymentLabel = paymentMethodLabels[sale.payment_method ?? ''] || sale.payment_method || '—'
    const paymentStatus =
        sale.status === 'cancelled'
            ? { label: 'Vente annulée', tone: 'default' as const }
            : remaining <= 0
                ? { label: 'Soldée', tone: 'success' as const }
                : Number(sale.paid_amount) > 0
                    ? { label: 'Partiellement payée', tone: 'warning' as const }
                    : { label: 'Non payée (à crédit)', tone: 'danger' as const }

    const nextStep: { status: string; label: string } | null =
        sale.status === 'pending'
            ? { status: 'confirmed', label: 'Confirmer la commande' }
            : sale.status === 'confirmed'
                ? { status: 'preparing', label: 'Mettre en préparation' }
                : sale.status === 'preparing'
                    ? { status: 'ready', label: 'Marquer comme prête' }
                    : sale.status === 'ready'
                        ? { status: 'delivered', label: 'Marquer comme livrée' }
                        : null
    const canChangeStatus = sale.status !== 'cancelled' && sale.status !== 'delivered'

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader title={`Vente ${sale.order_number}`} description={`Créée le ${formatDateTime(sale.created_at)}`} />

            <PageShell>
                {/* En-tête de détail */}
                <div className="space-y-3">
                    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
                        <Link href="/dashboard/sales">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            Ventes
                        </Link>
                    </Button>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-3">
                                <h2 className="font-mono text-2xl font-semibold tracking-tight text-foreground">{sale.order_number}</h2>
                                <StatusBadge status={sale.status} />
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {sale.client_name || 'Client passager'} · {formatDateTime(sale.created_at)}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {updating && (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Mise à jour en cours" />
                            )}
                            <Button variant="outline" asChild>
                                <Link href={`/dashboard/invoices/${sale.id}`}>
                                    <FileText className="h-4 w-4" aria-hidden="true" />
                                    Facture
                                </Link>
                            </Button>
                            {canChangeStatus && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={updating}>
                                            Annuler la vente
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Annuler la vente {sale.order_number} ?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Les produits et emballages seront remis en stock, la dette du client sera
                                                effacée et la facture annulée. Cette action est définitive.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Conserver la vente</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={() => updateStatus('cancelled')}
                                                className="bg-destructive text-white hover:bg-destructive/90"
                                            >
                                                Oui, annuler la vente
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                            {canChangeStatus && nextStep && (
                                <Button variant="brand" onClick={() => updateStatus(nextStep.status)} disabled={updating}>
                                    {nextStep.label}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid items-start gap-4 lg:grid-cols-3">
                    {/* Contenu principal */}
                    <div className="space-y-4 lg:col-span-2">
                        <Panel title="Produits" description={`${sale.items.length} ligne${sale.items.length > 1 ? 's' : ''}`}>
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="pl-5">Produit</TableHead>
                                        <TableHead className="text-right">Qté</TableHead>
                                        <TableHead className="text-right">Prix unitaire</TableHead>
                                        <TableHead className="pr-5 text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sale.items.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="pl-5">
                                                <p className="font-medium text-foreground">{item.product_name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {[item.brand, item.packaging_name || 'Standard'].filter(Boolean).join(' · ')}
                                                </p>
                                            </TableCell>
                                            <TableCell className="tabular text-right text-foreground">{formatNumber(item.quantity)}</TableCell>
                                            <TableCell className="tabular text-right text-muted-foreground">{formatMoney(Number(item.unit_price))}</TableCell>
                                            <TableCell className="tabular pr-5 text-right font-medium text-foreground">{formatMoney(Number(item.total_price))}</TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                                        <TableCell colSpan={3} className="pl-5 text-right text-sm text-muted-foreground">Sous-total produits</TableCell>
                                        <TableCell className="tabular pr-5 text-right font-semibold text-foreground">{formatMoney(Number(sale.subtotal))}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </Panel>

                        {sale.packagingItems && sale.packagingItems.length > 0 && (
                            <Panel title="Emballages" description="Casiers et bouteilles consignés">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="pl-5">Emballage</TableHead>
                                            <TableHead className="text-right">Sortis</TableHead>
                                            <TableHead className="text-right">Rendus</TableHead>
                                            <TableHead className="pr-5 text-right">Consigne</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sale.packagingItems.map((pkg) => (
                                            <TableRow key={pkg.id}>
                                                <TableCell className="pl-5 font-medium text-foreground">{pkg.packaging_name}</TableCell>
                                                <TableCell className="tabular text-right text-foreground">{formatNumber(pkg.quantity_out)}</TableCell>
                                                <TableCell className="tabular text-right text-foreground">{formatNumber(pkg.quantity_in)}</TableCell>
                                                <TableCell className="tabular pr-5 text-right font-medium text-foreground">
                                                    {formatMoney((Number(pkg.quantity_out) - Number(pkg.quantity_in)) * Number(pkg.unit_price))}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Panel>
                        )}

                        <Panel
                            title="Paiements"
                            description={`Mode : ${paymentLabel}`}
                            action={<StatusBadge label={paymentStatus.label} tone={paymentStatus.tone} />}
                        >
                            {sale.payments.length === 0 ? (
                                <p className="px-5 py-10 text-center text-sm text-muted-foreground">Aucun paiement enregistré</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="pl-5">Date</TableHead>
                                            <TableHead>Moyen</TableHead>
                                            <TableHead>Référence</TableHead>
                                            <TableHead className="pr-5 text-right">Montant</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sale.payments.map((p) => (
                                            <TableRow key={p.id}>
                                                <TableCell className="tabular pl-5 text-muted-foreground">{formatDateShort(p.created_at)}</TableCell>
                                                <TableCell className="text-foreground">{paymentMethodLabels[p.payment_method] || p.payment_method}</TableCell>
                                                <TableCell className="font-mono text-xs text-muted-foreground">{p.reference || '—'}</TableCell>
                                                <TableCell className="tabular pr-5 text-right font-medium text-foreground">{formatMoney(Number(p.amount))}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </Panel>

                        {sale.notes && (
                            <Panel title="Notes" bodyClassName="px-5 py-4">
                                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{sale.notes}</p>
                            </Panel>
                        )}
                    </div>

                    {/* Résumé */}
                    <div className="space-y-4 lg:sticky lg:top-20">
                        <Panel title="Résumé" bodyClassName="px-5 py-4">
                            <dl className="space-y-2.5 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-muted-foreground">Produits</dt>
                                    <dd className="tabular text-foreground">{formatMoney(Number(sale.subtotal))}</dd>
                                </div>
                                {Number(sale.packaging_total) > 0 && (
                                    <div className="flex items-center justify-between gap-3">
                                        <dt className="text-muted-foreground">Emballages</dt>
                                        <dd className="tabular text-foreground">{formatMoney(Number(sale.packaging_total))}</dd>
                                    </div>
                                )}
                                <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
                                    <dt className="font-medium text-foreground">Total</dt>
                                    <dd className="tabular text-lg font-semibold text-foreground">{formatMoney(Number(sale.total_amount))}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-muted-foreground">Encaissé</dt>
                                    <dd className="tabular text-foreground">{formatMoney(Number(sale.paid_amount))}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-muted-foreground">Reste à payer</dt>
                                    <dd className={`tabular font-semibold ${remaining > 0 ? 'text-destructive' : 'text-success'}`}>
                                        {remaining > 0 ? formatMoney(remaining) : 'Soldé'}
                                    </dd>
                                </div>
                            </dl>

                            {remaining > 0 && (
                                <div className="mt-4 space-y-1.5 rounded-lg bg-warning-soft px-3 py-2.5 text-xs">
                                    <p className="font-medium text-warning-foreground">Détail des impayés</p>
                                    <div className="flex justify-between gap-3 text-warning-foreground/90">
                                        <span>Produits</span>
                                        <span className="tabular">{remainingProducts > 0 ? formatMoney(remainingProducts) : 'Soldé'}</span>
                                    </div>
                                    <div className="flex justify-between gap-3 text-warning-foreground/90">
                                        <span>Emballages</span>
                                        <span className="tabular">{remainingPackaging > 0 ? formatMoney(remainingPackaging) : 'Soldé'}</span>
                                    </div>
                                </div>
                            )}
                        </Panel>

                        <Panel title="Client" bodyClassName="px-5 py-4">
                            <dl className="space-y-2.5 text-sm">
                                <div className="flex justify-between gap-3">
                                    <dt className="text-muted-foreground">Nom</dt>
                                    <dd className="text-right font-medium text-foreground">{sale.client_name || 'Client passager'}</dd>
                                </div>
                                {sale.client_phone && (
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Téléphone</dt>
                                        <dd className="tabular text-right text-foreground">{sale.client_phone}</dd>
                                    </div>
                                )}
                                {sale.client_address && (
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Adresse</dt>
                                        <dd className="text-right text-foreground">{sale.client_address}</dd>
                                    </div>
                                )}
                                {sale.depot_name && (
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Dépôt</dt>
                                        <dd className="text-right text-foreground">{sale.depot_name}</dd>
                                    </div>
                                )}
                                {sale.created_by_name && (
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Vendeur</dt>
                                        <dd className="text-right text-foreground">{sale.created_by_name}</dd>
                                    </div>
                                )}
                            </dl>
                        </Panel>
                    </div>
                </div>
            </PageShell>
        </div>
    )
}
