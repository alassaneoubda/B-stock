'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Loader2, Pencil, Plus, Phone, Mail, MapPin, Building2, Trash2 } from 'lucide-react'
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

    if (loading) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Fournisseur" description="Chargement..." />
                <main className="flex-1 p-4 lg:p-6">
                    <TableSkeleton rows={5} columns={4} />
                </main>
            </div>
        )
    }

    if (error || !supplier) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Fournisseur" description={error?.notFound ? 'Introuvable' : undefined} />
                <main className="flex-1 p-4 lg:p-6">
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
                    <div className="mt-4">
                        <Button variant="outline" asChild>
                            <Link href="/dashboard/suppliers">
                                <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                            </Link>
                        </Button>
                    </div>
                </main>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader title={supplier.name} description="Détail du fournisseur" />
            <main className="flex-1 p-4 lg:p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/suppliers">
                            <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                        </Link>
                    </Button>
                    <div className="flex gap-2">
                        <AlertDialog open={deleteOpen} onOpenChange={(next) => !deleting && setDeleteOpen(next)}>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                    <Trash2 className="h-4 w-4 mr-2" /> Supprimer
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
                                        className="bg-destructive text-white hover:bg-destructive/90"
                                    >
                                        {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                        Supprimer
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        <Button variant="outline" asChild>
                            <Link href={`/dashboard/suppliers/${supplier.id}/edit`}>
                                <Pencil className="h-4 w-4 mr-2" /> Modifier
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href={`/dashboard/procurement/new?supplier=${supplier.id}`}>
                                <Plus className="h-4 w-4 mr-2" /> Nouvelle commande
                            </Link>
                        </Button>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                            {supplier.name}
                            {supplier.type && <Badge variant="secondary">{typeLabels[supplier.type] || supplier.type}</Badge>}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
                        {supplier.contact_name && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Building2 className="h-4 w-4" /> {supplier.contact_name}
                            </div>
                        )}
                        {supplier.phone && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Phone className="h-4 w-4" /> {supplier.phone}
                            </div>
                        )}
                        {supplier.email && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Mail className="h-4 w-4" /> {supplier.email}
                            </div>
                        )}
                        {supplier.address && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <MapPin className="h-4 w-4" /> {supplier.address}
                            </div>
                        )}
                        {supplier.notes && (
                            <div className="sm:col-span-2 text-muted-foreground">{supplier.notes}</div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Commandes récentes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {supplier.recentOrders && supplier.recentOrders.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-left text-muted-foreground">
                                        <tr>
                                            <th className="p-2">N° commande</th>
                                            <th className="p-2">Date</th>
                                            <th className="p-2">Statut</th>
                                            <th className="p-2 text-right">Montant</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {supplier.recentOrders.map((o) => (
                                            <tr key={o.id} className="hover:bg-muted/40">
                                                <td className="p-2">
                                                    <Link href={`/dashboard/procurement/${o.id}`} className="font-medium hover:underline">
                                                        {o.order_number}
                                                    </Link>
                                                </td>
                                                <td className="p-2 text-muted-foreground">
                                                    {formatDate(o.created_at)}
                                                </td>
                                                <td className="p-2"><Badge variant="outline">{orderStatusLabels[o.status] || o.status}</Badge></td>
                                                <td className="p-2 text-right font-medium">{formatMoney(o.total_amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <EmptyState
                                title="Aucune commande pour ce fournisseur"
                                action={{ label: 'Nouvelle commande', href: `/dashboard/procurement/new?supplier=${supplier.id}` }}
                            />
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}
