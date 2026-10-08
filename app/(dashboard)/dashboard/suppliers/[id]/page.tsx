'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel, StatusBadge } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
    ArrowLeft,
    Building2,
    Loader2,
    Mail,
    MapPin,
    Pencil,
    Phone,
    Plus,
    ShoppingCart,
    Trash2,
    type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
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
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { ApiError, apiFetch, errorMessage, toastError, toastWarnings } from '@/lib/api-client'
import { formatDate, formatMoney } from '@/lib/format'
import { SupplierAccount } from './supplier-account'

interface PurchaseOrder {
    id: string
    order_number: string
    total_amount: number
    status: string
    created_at: string
}

interface Supplier {
    id: string
    name: string
    type: string | null
    contact_name: string | null
    phone: string | null
    email: string | null
    address: string | null
    notes: string | null
    recentOrders?: PurchaseOrder[]
}

const typeLabels: Record<string, string> = {
    manufacturer: 'Fabricant',
    distributor: 'Distributeur',
    wholesaler: 'Grossiste',
}

const orderStatusLabels: Record<string, string> = {
    pending: 'En attente',
    confirmed: 'Confirmée',
    partial: 'Partiellement reçue',
    received: 'Reçue',
    cancelled: 'Annulée',
}

const orderStatusTones: Record<string, 'default' | 'success' | 'warning' | 'info'> = {
    pending: 'warning',
    confirmed: 'info',
    partial: 'warning',
    received: 'success',
    cancelled: 'default',
}

export default function SupplierDetailPage() {
    const params = useParams()
    const supplierId = params.id as string
    const router = useRouter()
    const [supplier, setSupplier] = useState<Supplier | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null)
    const [reloadKey, setReloadKey] = useState(0)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleting, setDeleting] = useState(false)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        apiFetch<{ data: Supplier }>(`/api/suppliers/${supplierId}`)
            .then((result) => {
                if (!cancelled) setSupplier(result.data)
            })
            .catch((e) => {
                if (!cancelled) {
                    setError({ message: errorMessage(e), notFound: e instanceof ApiError && e.status === 404 })
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [supplierId, reloadKey])

    async function handleDelete() {
        setDeleting(true)
        try {
            const res = await apiFetch<{ message?: string; warnings?: unknown }>(`/api/suppliers/${supplierId}`, {
                method: 'DELETE',
            })
            setDeleteOpen(false)
            toast.success(res?.message || 'Fournisseur supprimé')
            toastWarnings(res?.warnings)
            router.push('/dashboard/suppliers')
            router.refresh()
        } catch (e) {
            // 400/409 : fournisseur lié à des commandes, factures…
            setDeleteOpen(false)
            toastError(e, 'Suppression impossible')
        } finally {
            setDeleting(false)
        }
    }

    const backLink = (
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
            <Link href="/dashboard/suppliers">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Fournisseurs
            </Link>
        </Button>
    )

    if (loading) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Fournisseur" description="Chargement…" />
                <PageShell>
                    {backLink}
                    <TableSkeleton rows={5} columns={4} />
                </PageShell>
            </div>
        )
    }

    if (error || !supplier) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Fournisseur" description={error?.notFound ? 'Introuvable' : undefined} />
                <PageShell>
                    {backLink}
                    {error?.notFound ? (
                        <EmptyState
                            icon={Building2}
                            title="Fournisseur introuvable"
                            description="Ce fournisseur n'existe pas ou a été supprimé."
                            action={{ label: 'Retour aux fournisseurs', href: '/dashboard/suppliers' }}
                        />
                    ) : (
                        <ErrorState
                            title="Impossible de charger le fournisseur"
                            description={error?.message}
                            onRetry={() => setReloadKey((k) => k + 1)}
                        />
                    )}
                </PageShell>
            </div>
        )
    }

    const orders = supplier.recentOrders ?? []
    const ordersTotal = orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader title={supplier.name} description="Fiche fournisseur" />
            <PageShell>
                <div className="space-y-3">
                    {backLink}
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="truncate text-2xl font-semibold tracking-tight text-foreground">{supplier.name}</h2>
                                <Badge variant="muted">
                                    {supplier.type ? typeLabels[supplier.type] || supplier.type : 'Non classé'}
                                </Badge>
                            </div>
                            {supplier.contact_name && (
                                <p className="text-sm text-muted-foreground">Contact : {supplier.contact_name}</p>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <AlertDialog open={deleteOpen} onOpenChange={(next) => !deleting && setDeleteOpen(next)}>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                                        <Trash2 className="h-4 w-4" aria-hidden="true" /> Supprimer
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Supprimer « {supplier.name} » ?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Le fournisseur sera supprimé définitivement. La suppression est refusée
                                            s&apos;il a des commandes d&apos;achat ou s&apos;il est référencé ailleurs
                                            (factures, produits…).
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
                                        <AlertDialogAction
                                            disabled={deleting}
                                            onClick={(e) => {
                                                e.preventDefault()
                                                handleDelete()
                                            }}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                            {deleting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                            Supprimer
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            <Button variant="outline" asChild>
                                <Link href={`/dashboard/suppliers/${supplier.id}/edit`}>
                                    <Pencil className="h-4 w-4" aria-hidden="true" /> Modifier
                                </Link>
                            </Button>
                            <Button variant="brand" asChild>
                                <Link href={`/dashboard/procurement/new?supplier=${supplier.id}`}>
                                    <Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle commande
                                </Link>
                            </Button>
                        </div>
                    </div>
                </div>

                <SupplierAccount supplierId={supplier.id} />

                <div className="grid gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                        <Panel
                            title="Commandes récentes"
                            description="Dernières commandes d'achat passées à ce fournisseur"
                            bodyClassName={orders.length > 0 ? undefined : 'p-5'}
                        >
                            {orders.length > 0 ? (
                                <>
                                    <div className="hidden md:block">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="hover:bg-transparent">
                                                    <TableHead className="pl-5">N° commande</TableHead>
                                                    <TableHead>Date</TableHead>
                                                    <TableHead>Statut</TableHead>
                                                    <TableHead className="pr-5 text-right">Montant</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {orders.map((o) => (
                                                    <TableRow
                                                        key={o.id}
                                                        className="cursor-pointer transition-colors hover:bg-muted/40"
                                                        onClick={() => router.push(`/dashboard/procurement/${o.id}`)}
                                                    >
                                                        <TableCell className="py-3 pl-5">
                                                            <Link
                                                                href={`/dashboard/procurement/${o.id}`}
                                                                className="tabular rounded-sm text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                {o.order_number}
                                                            </Link>
                                                        </TableCell>
                                                        <TableCell className="tabular py-3 text-sm text-muted-foreground">
                                                            {formatDate(o.created_at)}
                                                        </TableCell>
                                                        <TableCell className="py-3">
                                                            <StatusBadge
                                                                label={orderStatusLabels[o.status] || o.status}
                                                                tone={orderStatusTones[o.status] ?? 'default'}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="tabular py-3 pr-5 text-right text-sm font-medium text-foreground">
                                                            {formatMoney(o.total_amount)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    <ul className="divide-y divide-border md:hidden">
                                        {orders.map((o) => (
                                            <li key={o.id}>
                                                <Link
                                                    href={`/dashboard/procurement/${o.id}`}
                                                    className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                                                >
                                                    <div className="min-w-0 space-y-1">
                                                        <p className="tabular truncate text-sm font-medium text-foreground">{o.order_number}</p>
                                                        <p className="tabular text-xs text-muted-foreground">{formatDate(o.created_at)}</p>
                                                    </div>
                                                    <div className="flex shrink-0 flex-col items-end gap-1">
                                                        <p className="tabular text-sm font-medium text-foreground">{formatMoney(o.total_amount)}</p>
                                                        <StatusBadge
                                                            label={orderStatusLabels[o.status] || o.status}
                                                            tone={orderStatusTones[o.status] ?? 'default'}
                                                        />
                                                    </div>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            ) : (
                                <EmptyState
                                    icon={ShoppingCart}
                                    title="Aucune commande pour ce fournisseur"
                                    description="Les commandes d'achat passées à ce fournisseur apparaîtront ici."
                                    action={{ label: 'Nouvelle commande', href: `/dashboard/procurement/new?supplier=${supplier.id}` }}
                                />
                            )}
                        </Panel>
                    </div>

                    <div className="space-y-6">
                        <Panel title="Coordonnées" bodyClassName="space-y-3 p-5">
                            <InfoRow icon={Building2} label="Contact" value={supplier.contact_name} />
                            <InfoRow
                                icon={Phone}
                                label="Téléphone"
                                value={supplier.phone}
                                href={supplier.phone ? `tel:${supplier.phone}` : undefined}
                            />
                            <InfoRow
                                icon={Mail}
                                label="E-mail"
                                value={supplier.email}
                                href={supplier.email ? `mailto:${supplier.email}` : undefined}
                            />
                            <InfoRow icon={MapPin} label="Adresse" value={supplier.address} />
                        </Panel>

                        <Panel title="Résumé" bodyClassName="space-y-2.5 p-5">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Commandes récentes</span>
                                <span className="tabular font-medium text-foreground">{orders.length}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Montant cumulé</span>
                                <span className="tabular font-medium text-foreground">{formatMoney(ordersTotal)}</span>
                            </div>
                        </Panel>

                        {supplier.notes && (
                            <Panel title="Notes" bodyClassName="p-5">
                                <p className="whitespace-pre-line text-sm text-muted-foreground">{supplier.notes}</p>
                            </Panel>
                        )}
                    </div>
                </div>
            </PageShell>
        </div>
    )
}

function InfoRow({
    icon: Icon,
    label,
    value,
    href,
}: {
    icon: LucideIcon
    label: string
    value: string | null
    href?: string
}) {
    return (
        <div className="flex items-start gap-3 text-sm">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{label}</p>
                {value ? (
                    href ? (
                        <a href={href} className="break-words text-foreground hover:underline">
                            {value}
                        </a>
                    ) : (
                        <p className="break-words text-foreground">{value}</p>
                    )
                ) : (
                    <p className="text-muted-foreground">Non renseigné</p>
                )}
            </div>
        </div>
    )
}
