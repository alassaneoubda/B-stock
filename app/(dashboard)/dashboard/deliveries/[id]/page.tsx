'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    ArrowLeft, Truck, MapPin, User, Calendar, Clock, CheckCircle2,
    PlayCircle, Package, Loader2, Navigation, PackageOpen,
    XCircle, RotateCcw, Lock,
} from 'lucide-react'
import Link from 'next/link'
import { ApiError, apiFetch, toastError, toastWarnings } from '@/lib/api-client'
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'

interface Stop {
    id: string
    client_name: string
    client_address: string | null
    client_phone: string | null
    client_zone: string | null
    order_number: string | null
    total_amount: number | null
    paid_amount: number | null
    stop_order: number
    status: string
    delivered_at: string | null
    notes: string | null
}

interface InventoryItem {
    id: string
    inventory_type: string
    product_name: string | null
    packaging_name: string | null
    variant_price: number | null
    loaded_quantity: number
    unloaded_quantity: number
    returned_quantity: number
    damaged_quantity: number
}

interface TourDetail {
    id: string
    tour_date: string
    status: string
    driver_name: string | null
    vehicle_name: string | null
    vehicle_plate: string | null
    depot_name: string | null
    created_by_name: string | null
    notes: string | null
    started_at: string | null
    completed_at: string | null
    stops: Stop[]
    inventory: InventoryItem[]
}

type TourStatus = 'planned' | 'loading' | 'in_progress' | 'completed' | 'cancelled'

/** Miroir de la table de transitions de PATCH /api/deliveries/[id]. */
const TRANSITIONS: Record<TourStatus, TourStatus[]> = {
    planned: ['loading', 'in_progress', 'cancelled'],
    loading: ['in_progress', 'planned', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    planned: { label: 'Planifiée', color: 'bg-muted text-muted-foreground', icon: Clock },
    loading: { label: 'Chargement', color: 'bg-warning-soft text-warning-foreground', icon: PlayCircle },
    in_progress: { label: 'En route', color: 'bg-brand-soft text-brand-strong', icon: Navigation },
    completed: { label: 'Terminée', color: 'bg-success-soft text-success', icon: CheckCircle2 },
    cancelled: { label: 'Annulée', color: 'bg-destructive/10 text-destructive', icon: XCircle },
}

const stopStatusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'En attente', color: 'bg-muted text-muted-foreground' },
    delivered: { label: 'Livré', color: 'bg-success-soft text-success' },
    partial: { label: 'Partiel', color: 'bg-warning-soft text-warning-foreground' },
    failed: { label: 'Échoué', color: 'bg-destructive/10 text-destructive' },
}

const STOP_SUCCESS: Record<string, string> = {
    delivered: 'Arrêt marqué livré',
    partial: 'Arrêt marqué livré partiellement',
    failed: 'Arrêt marqué en échec',
}

/** Transitions finales : confirmation obligatoire. */
type ConfirmTarget = 'completed' | 'cancelled' | null

export default function DeliveryDetailPage() {
    const params = useParams()
    const tourId = params.id as string

    const [tour, setTour] = useState<TourDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [updating, setUpdating] = useState<TourStatus | null>(null)
    const [updatingStop, setUpdatingStop] = useState<string | null>(null)
    const [loadError, setLoadError] = useState<{ notFound: boolean; message: string } | null>(null)
    const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null)

    const fetchTour = useCallback(async (opts: { silent?: boolean } = {}) => {
        if (!opts.silent) {
            setLoading(true)
            setLoadError(null)
        }
        try {
            const data = await apiFetch<{ data: TourDetail }>(`/api/deliveries/${tourId}`)
            setTour(data.data)
            setLoadError(null)
        } catch (e) {
            if (opts.silent) {
                toastError(e, 'Actualisation impossible')
            } else {
                setLoadError({
                    notFound: e instanceof ApiError && e.status === 404,
                    message: e instanceof Error ? e.message : 'Erreur de chargement',
                })
            }
        } finally {
            setLoading(false)
        }
    }, [tourId])

    useEffect(() => { fetchTour() }, [fetchTour])

    async function updateTourStatus(newStatus: TourStatus, successMessage: string) {
        if (updating) return
        setUpdating(newStatus)
        try {
            const res = await apiFetch(`/api/deliveries/${tourId}`, {
                method: 'PATCH',
                body: { status: newStatus },
            })
            toast.success(successMessage)
            toastWarnings(res?.warnings)
            setConfirmTarget(null)
            await fetchTour({ silent: true })
        } catch (e) {
            toastError(e, 'Changement de statut impossible')
            // La tournée a pu changer entre-temps (409) : on resynchronise l'écran
            if (e instanceof ApiError && e.status === 409) fetchTour({ silent: true })
        } finally {
            setUpdating(null)
        }
    }

    async function updateStopStatus(stopId: string, status: string) {
        if (updatingStop) return
        setUpdatingStop(stopId)
        try {
            const res = await apiFetch(`/api/deliveries/${tourId}/stops`, {
                method: 'PATCH',
                body: { stopId, status },
            })
            toast.success(STOP_SUCCESS[status] ?? 'Arrêt mis à jour')
            toastWarnings(res?.warnings)
            await fetchTour({ silent: true })
        } catch (e) {
            toastError(e, "Mise à jour de l'arrêt impossible")
            if (e instanceof ApiError && e.status === 409) fetchTour({ silent: true })
        } finally {
            setUpdatingStop(null)
        }
    }

    if (loading) {
        return <PageSkeleton />
    }

    if (loadError || !tour) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title={loadError?.notFound ? 'Tournée introuvable' : 'Détail Tournée'} description="" />
                <main className="flex-1 p-6 space-y-4">
                    {loadError?.notFound ? (
                        <EmptyState
                            icon={Truck}
                            title="Tournée introuvable"
                            description="Cette tournée n'existe pas ou a été supprimée."
                            action={{ label: 'Retour aux tournées', href: '/dashboard/deliveries' }}
                        />
                    ) : (
                        <ErrorState
                            title="Impossible de charger la tournée"
                            description={loadError?.message}
                            onRetry={() => fetchTour()}
                        />
                    )}
                </main>
            </div>
        )
    }

    const currentStatus = tour.status as TourStatus
    const allowed = TRANSITIONS[currentStatus] ?? []
    const isClosed = allowed.length === 0
    const can = (to: TourStatus) => allowed.includes(to)

    const statusInfo = statusConfig[tour.status] || statusConfig.planned
    const StatusIcon = statusInfo.icon
    const deliveredStops = tour.stops.filter(s => s.status === 'delivered').length
    const pendingStops = tour.stops.filter(s => s.status === 'pending').length
    const totalStops = tour.stops.length
    const progress = totalStops > 0 ? Math.round((deliveredStops / totalStops) * 100) : 0

    const productInventory = tour.inventory.filter(i => i.inventory_type === 'product')
    const packagingInventory = tour.inventory.filter(i => i.inventory_type === 'packaging')

    const busy = updating !== null
    const spinnerOr = (status: TourStatus, icon: React.ReactNode) =>
        updating === status ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : icon

    return (
        <div className="flex flex-col min-h-screen bg-muted/30">
            <DashboardHeader
                title={`Tournée du ${new Date(tour.tour_date).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`}
                description="Gestion complète de la tournée de livraison"
            />

            <main className="flex-1 p-4 lg:p-6 space-y-6 ">
                {/* Actions bar : uniquement les transitions acceptées par l'API */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <Button variant="ghost" size="sm" asChild className="rounded-xl border border-border">
                        <Link href="/dashboard/deliveries">
                            <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                        </Link>
                    </Button>
                    <div className="flex gap-3 flex-wrap">
                        {currentStatus === 'planned' && can('loading') && (
                            <Button
                                onClick={() => updateTourStatus('loading', 'Chargement démarré')}
                                disabled={busy}
                                className="rounded-xl bg-warning hover:bg-warning font-bold h-10 px-6"
                            >
                                {spinnerOr('loading', <PlayCircle className="h-4 w-4 mr-2" />)} Démarrer chargement
                            </Button>
                        )}
                        {can('in_progress') && (
                            <Button
                                onClick={() => updateTourStatus('in_progress', 'Tournée partie en livraison')}
                                disabled={busy}
                                className="rounded-xl bg-primary hover:bg-primary font-bold h-10 px-6"
                            >
                                {spinnerOr('in_progress', <Navigation className="h-4 w-4 mr-2" />)} Départ livraison
                            </Button>
                        )}
                        {can('completed') && (
                            <Button
                                onClick={() => setConfirmTarget('completed')}
                                disabled={busy}
                                className="rounded-xl bg-success hover:bg-success font-bold h-10 px-6"
                            >
                                {spinnerOr('completed', <CheckCircle2 className="h-4 w-4 mr-2" />)} Terminer la tournée
                            </Button>
                        )}
                        {(currentStatus === 'planned' || currentStatus === 'loading') && (
                            <Button variant="outline" asChild className="rounded-xl font-bold h-10 px-6">
                                <Link href={`/dashboard/deliveries/${tour.id}/load`}>
                                    <Package className="h-4 w-4 mr-2" /> Gérer le chargement
                                </Link>
                            </Button>
                        )}
                        {currentStatus === 'loading' && can('planned') && (
                            <Button
                                variant="outline"
                                onClick={() => updateTourStatus('planned', 'Tournée remise en planification')}
                                disabled={busy}
                                className="rounded-xl font-bold h-10 px-6"
                            >
                                {spinnerOr('planned', <RotateCcw className="h-4 w-4 mr-2" />)} Revenir à « Planifiée »
                            </Button>
                        )}
                        {can('cancelled') && (
                            <Button
                                variant="outline"
                                onClick={() => setConfirmTarget('cancelled')}
                                disabled={busy}
                                className="rounded-xl font-bold h-10 px-6 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                            >
                                {spinnerOr('cancelled', <XCircle className="h-4 w-4 mr-2" />)} Annuler la tournée
                            </Button>
                        )}
                    </div>
                </div>

                {isClosed && (
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                        <Lock className="h-4 w-4 text-muted-foreground/70 shrink-0" aria-hidden="true" />
                        Cette tournée est {currentStatus === 'cancelled' ? 'annulée' : 'terminée'} : les arrêts et l&apos;inventaire ne sont plus modifiables.
                    </div>
                )}

                <AlertDialog
                    open={confirmTarget !== null}
                    onOpenChange={(open) => { if (!open && !busy) setConfirmTarget(null) }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {confirmTarget === 'cancelled' ? 'Annuler cette tournée ?' : 'Terminer cette tournée ?'}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {confirmTarget === 'cancelled'
                                    ? "La tournée passera au statut « Annulée ». C'est définitif : elle ne pourra plus être relancée, et ses arrêts et son inventaire ne seront plus modifiables."
                                    : `La tournée passera au statut « Terminée ». C'est définitif : ses arrêts et son inventaire ne seront plus modifiables.${pendingStops > 0 ? ` Attention : ${pendingStops} arrêt${pendingStops > 1 ? 's sont' : ' est'} encore en attente.` : ''}`}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={busy}>Retour</AlertDialogCancel>
                            <AlertDialogAction
                                disabled={busy}
                                className={confirmTarget === 'cancelled' ? 'bg-destructive hover:bg-destructive' : 'bg-success hover:bg-success'}
                                onClick={(e) => {
                                    // On garde la boîte ouverte jusqu'à la réponse du serveur
                                    e.preventDefault()
                                    if (confirmTarget === 'cancelled') updateTourStatus('cancelled', 'Tournée annulée')
                                    else if (confirmTarget === 'completed') updateTourStatus('completed', 'Tournée terminée')
                                }}
                            >
                                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {confirmTarget === 'cancelled' ? 'Annuler la tournée' : 'Terminer la tournée'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Stats row */}
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    <Card className="rounded-xl border-border">
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${statusInfo.color}`}>
                                <StatusIcon className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Statut</p>
                                <p className="text-lg font-semibold text-foreground">{statusInfo.label}</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="rounded-xl border-border">
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-brand-soft flex items-center justify-center text-brand-strong">
                                <MapPin className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Arrêts</p>
                                <p className="text-lg font-semibold text-foreground">{formatNumber(deliveredStops)}/{formatNumber(totalStops)}</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="rounded-xl border-border">
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-success-soft flex items-center justify-center text-success">
                                <Package className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Produits chargés</p>
                                <p className="text-lg font-semibold text-foreground">
                                    {formatNumber(productInventory.reduce((s, i) => s + Number(i.loaded_quantity || 0), 0))}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="rounded-xl border-border">
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-warning-soft flex items-center justify-center text-warning-foreground">
                                <PackageOpen className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Emb. chargés</p>
                                <p className="text-lg font-semibold text-foreground">
                                    {formatNumber(packagingInventory.reduce((s, i) => s + Number(i.loaded_quantity || 0), 0))}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main: Stops */}
                    <div className="lg:col-span-2 space-y-6">
                        <Card className="rounded-lg border-border shadow-sm overflow-hidden">
                            <CardHeader className="px-8 py-6 border-b border-border">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-xl font-semibold text-foreground">Arrêts de livraison</CardTitle>
                                        <CardDescription>
                                            {totalStops} arrêt{totalStops > 1 ? 's' : ''} — {progress}% complété
                                        </CardDescription>
                                    </div>
                                    {totalStops > 0 && (
                                        <div className="flex items-center gap-2 w-32">
                                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${progress === 100 ? 'bg-success' : 'bg-primary'}`}
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                            <span className="text-xs font-semibold text-muted-foreground/70">{progress}%</span>
                                        </div>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {tour.stops.length === 0 ? (
                                    <EmptyState
                                        icon={MapPin}
                                        title="Aucun arrêt configuré"
                                        description="Cette tournée ne comporte encore aucun arrêt de livraison."
                                        className="m-6"
                                    />
                                ) : (
                                    <div className="divide-y divide-border">
                                        {tour.stops.map((stop, idx) => {
                                            const sInfo = stopStatusConfig[stop.status] || stopStatusConfig.pending
                                            return (
                                                <div key={stop.id} className="flex items-center gap-4 px-8 py-5 hover:bg-muted/30 transition-colors">
                                                    <div className="flex flex-col items-center gap-1 shrink-0 w-8">
                                                        <span className="h-8 w-8 rounded-full bg-brand-soft flex items-center justify-center text-brand-strong text-xs font-semibold">
                                                            {idx + 1}
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-foreground truncate">{stop.client_name}</p>
                                                        <div className="flex items-center gap-3 text-xs text-muted-foreground/70 mt-1">
                                                            {stop.client_zone && <span className="font-bold">{stop.client_zone}</span>}
                                                            {stop.client_phone && <span>{stop.client_phone}</span>}
                                                            {stop.order_number && (
                                                                <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
                                                                    {stop.order_number}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {stop.total_amount != null && (
                                                            <p className="text-xs font-bold text-muted-foreground mt-1">
                                                                {formatMoney(Number(stop.total_amount))}
                                                                {Number(stop.paid_amount) < Number(stop.total_amount) && (
                                                                    <span className="text-destructive ml-2">
                                                                        (reste {formatMoney(Number(stop.total_amount) - Number(stop.paid_amount || 0))})
                                                                    </span>
                                                                )}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3 shrink-0">
                                                        {updatingStop === stop.id && (
                                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/70" aria-label="Mise à jour en cours" />
                                                        )}
                                                        {!isClosed && (currentStatus === 'in_progress' || currentStatus === 'loading') && stop.status === 'pending' && (
                                                            <Select
                                                                value=""
                                                                onValueChange={(val) => updateStopStatus(stop.id, val)}
                                                                disabled={updatingStop !== null || busy}
                                                            >
                                                                <SelectTrigger className="h-8 w-32 rounded-lg text-xs" aria-label={`Statut de l'arrêt ${stop.client_name}`}>
                                                                    <SelectValue placeholder="Action..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="delivered">Livré</SelectItem>
                                                                    <SelectItem value="partial">Partiel</SelectItem>
                                                                    <SelectItem value="failed">Échoué</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                        <Badge className={`rounded-full px-3 py-1 text-[9px] font-semibold uppercase tracking-wider border-none ${sInfo.color}`}>
                                                            {sInfo.label}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Vehicle Inventory */}
                        {tour.inventory.length > 0 && (
                            <Card className="rounded-lg border-border shadow-sm overflow-hidden">
                                <CardHeader className="px-8 py-6 border-b border-border">
                                    <CardTitle className="text-xl font-semibold text-foreground">Inventaire Véhicule</CardTitle>
                                    <CardDescription>Chargé / Déchargé / Retours / Endommagé</CardDescription>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader className="bg-muted/30">
                                            <TableRow className="border-none">
                                                <TableHead className="py-4 pl-8 font-semibold uppercase text-[10px] tracking-wider text-muted-foreground/70">Article</TableHead>
                                                <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-muted-foreground/70">Type</TableHead>
                                                <TableHead className="py-4 text-center font-semibold uppercase text-[10px] tracking-wider text-brand-strong">Chargé</TableHead>
                                                <TableHead className="py-4 text-center font-semibold uppercase text-[10px] tracking-wider text-success">Déchargé</TableHead>
                                                <TableHead className="py-4 text-center font-semibold uppercase text-[10px] tracking-wider text-warning-foreground">Retours</TableHead>
                                                <TableHead className="py-4 text-center pr-8 font-semibold uppercase text-[10px] tracking-wider text-destructive">Endommagé</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {tour.inventory.map(item => (
                                                <TableRow key={item.id} className="border-b border-border hover:bg-muted/30">
                                                    <TableCell className="py-4 pl-8 font-semibold text-foreground">
                                                        {item.product_name || item.packaging_name || '—'}
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <Badge className={`rounded-lg px-2.5 py-0.5 text-[9px] font-semibold uppercase border-none ${
                                                            item.inventory_type === 'product' ? 'bg-brand-soft text-brand-strong' : 'bg-warning-soft text-warning-foreground'
                                                        }`}>
                                                            {item.inventory_type === 'product' ? 'Produit' : 'Emballage'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="py-4 text-center font-semibold text-brand-strong">{formatNumber(item.loaded_quantity)}</TableCell>
                                                    <TableCell className="py-4 text-center font-semibold text-success">{formatNumber(item.unloaded_quantity)}</TableCell>
                                                    <TableCell className="py-4 text-center font-semibold text-warning-foreground">{formatNumber(item.returned_quantity)}</TableCell>
                                                    <TableCell className="py-4 text-center pr-8 font-semibold text-destructive">{formatNumber(item.damaged_quantity)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        <Card className="rounded-lg border-border shadow-sm">
                            <CardHeader className="px-8 py-6 border-b border-border">
                                <CardTitle className="text-lg font-semibold text-foreground">Informations</CardTitle>
                            </CardHeader>
                            <CardContent className="p-8 space-y-5">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2 text-muted-foreground/70">
                                        <Calendar className="h-4 w-4" />
                                        <span className="text-[10px] font-semibold uppercase tracking-wider">Date</span>
                                    </div>
                                    <span className="text-sm font-semibold text-foreground">
                                        {formatDate(tour.tour_date)}
                                    </span>
                                </div>
                                <Separator />
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2 text-muted-foreground/70">
                                        <User className="h-4 w-4" />
                                        <span className="text-[10px] font-semibold uppercase tracking-wider">Chauffeur</span>
                                    </div>
                                    <span className="text-sm font-semibold text-foreground">{tour.driver_name || 'Non assigné'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2 text-muted-foreground/70">
                                        <Truck className="h-4 w-4" />
                                        <span className="text-[10px] font-semibold uppercase tracking-wider">Véhicule</span>
                                    </div>
                                    <span className="text-sm font-semibold text-foreground">
                                        {tour.vehicle_name || 'Non assigné'}
                                        {tour.vehicle_plate && <code className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded">{tour.vehicle_plate}</code>}
                                    </span>
                                </div>
                                {tour.depot_name && (
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2 text-muted-foreground/70">
                                            <Package className="h-4 w-4" />
                                            <span className="text-[10px] font-semibold uppercase tracking-wider">Dépôt</span>
                                        </div>
                                        <span className="text-sm font-semibold text-foreground">{tour.depot_name}</span>
                                    </div>
                                )}
                                <Separator />
                                {tour.started_at && (
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2 text-muted-foreground/70">
                                            <Clock className="h-4 w-4" />
                                            <span className="text-[10px] font-semibold uppercase tracking-wider">Départ</span>
                                        </div>
                                        <span className="text-xs font-bold text-muted-foreground">
                                            {formatDateTime(tour.started_at)}
                                        </span>
                                    </div>
                                )}
                                {tour.completed_at && (
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2 text-muted-foreground/70">
                                            <CheckCircle2 className="h-4 w-4" />
                                            <span className="text-[10px] font-semibold uppercase tracking-wider">Fin</span>
                                        </div>
                                        <span className="text-xs font-bold text-muted-foreground">
                                            {formatDateTime(tour.completed_at)}
                                        </span>
                                    </div>
                                )}
                                {tour.created_by_name && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Créé par</span>
                                        <span className="text-xs font-bold text-muted-foreground">{tour.created_by_name}</span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {tour.notes && (
                            <Card className="rounded-lg border-border shadow-sm">
                                <CardHeader className="px-8 py-5 border-b border-border">
                                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">Notes</CardTitle>
                                </CardHeader>
                                <CardContent className="p-8">
                                    <p className="text-sm font-medium text-muted-foreground italic leading-relaxed">&ldquo;{tour.notes}&rdquo;</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
