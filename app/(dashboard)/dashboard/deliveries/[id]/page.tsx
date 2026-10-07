'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
import { Button, buttonVariants } from '@/components/ui/button'
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
    ArrowLeft, Truck, MapPin, CheckCircle2, PlayCircle, Package, Loader2,
    Navigation, PackageOpen, XCircle, RotateCcw, Lock,
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

type Tone = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

const statusConfig: Record<string, { label: string; tone: Tone }> = {
    planned: { label: 'Planifiée', tone: 'default' },
    loading: { label: 'Chargement', tone: 'warning' },
    in_progress: { label: 'En route', tone: 'brand' },
    completed: { label: 'Terminée', tone: 'success' },
    cancelled: { label: 'Annulée', tone: 'danger' },
}

const stopStatusConfig: Record<string, { label: string; tone: Tone }> = {
    pending: { label: 'En attente', tone: 'default' },
    delivered: { label: 'Livré', tone: 'success' },
    partial: { label: 'Partiel', tone: 'warning' },
    failed: { label: 'Échoué', tone: 'danger' },
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
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title={loadError?.notFound ? 'Tournée introuvable' : 'Détail de la tournée'} />
                <PageShell>
                    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
                        <Link href="/dashboard/deliveries">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            Livraisons
                        </Link>
                    </Button>
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
                </PageShell>
            </div>
        )
    }

    const currentStatus = tour.status as TourStatus
    const allowed = TRANSITIONS[currentStatus] ?? []
    const isClosed = allowed.length === 0
    const can = (to: TourStatus) => allowed.includes(to)

    const statusInfo = statusConfig[tour.status] || statusConfig.planned
    const deliveredStops = tour.stops.filter(s => s.status === 'delivered').length
    const pendingStops = tour.stops.filter(s => s.status === 'pending').length
    const totalStops = tour.stops.length
    const progress = totalStops > 0 ? Math.round((deliveredStops / totalStops) * 100) : 0

    const productInventory = tour.inventory.filter(i => i.inventory_type === 'product')
    const packagingInventory = tour.inventory.filter(i => i.inventory_type === 'packaging')

    const busy = updating !== null
    const spinnerOr = (status: TourStatus, icon: React.ReactNode) =>
        updating === status ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon

    // Une seule action phare : l'étape suivante logique de la tournée
    const keyAction: TourStatus =
        currentStatus === 'planned' ? 'loading' : currentStatus === 'loading' ? 'in_progress' : 'completed'
    const variantFor = (status: TourStatus) => (keyAction === status ? 'brand' : 'default')

    const tourDateLabel = new Date(tour.tour_date).toLocaleDateString('fr-FR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    })

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Détail de la tournée"
                description={[tour.vehicle_name, tour.driver_name].filter(Boolean).join(' · ') || 'Tournée de livraison'}
            />

            <PageShell>
                <div className="space-y-4">
                    <Button variant="ghost" size="sm" asChild className="-ml-2">
                        <Link href="/dashboard/deliveries">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            Livraisons
                        </Link>
                    </Button>

                    {/* Titre + actions : uniquement les transitions acceptées par l'API */}
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-3">
                                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                                    Tournée du {tourDateLabel}
                                </h2>
                                <StatusBadge label={statusInfo.label} tone={statusInfo.tone} />
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {totalStops} arrêt{totalStops > 1 ? 's' : ''} · {progress}% livré
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {can('cancelled') && (
                                <Button
                                    variant="ghost"
                                    onClick={() => setConfirmTarget('cancelled')}
                                    disabled={busy}
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                >
                                    {spinnerOr('cancelled', <XCircle className="h-4 w-4" aria-hidden="true" />)} Annuler la tournée
                                </Button>
                            )}
                            {currentStatus === 'loading' && can('planned') && (
                                <Button
                                    variant="outline"
                                    onClick={() => updateTourStatus('planned', 'Tournée remise en planification')}
                                    disabled={busy}
                                >
                                    {spinnerOr('planned', <RotateCcw className="h-4 w-4" aria-hidden="true" />)} Revenir à « Planifiée »
                                </Button>
                            )}
                            {(currentStatus === 'planned' || currentStatus === 'loading') && (
                                <Button variant="outline" asChild>
                                    <Link href={`/dashboard/deliveries/${tour.id}/load`}>
                                        <Package className="h-4 w-4" aria-hidden="true" /> Gérer le chargement
                                    </Link>
                                </Button>
                            )}
                            {currentStatus === 'planned' && can('loading') && (
                                <Button
                                    variant={variantFor('loading')}
                                    onClick={() => updateTourStatus('loading', 'Chargement démarré')}
                                    disabled={busy}
                                >
                                    {spinnerOr('loading', <PlayCircle className="h-4 w-4" aria-hidden="true" />)} Démarrer le chargement
                                </Button>
                            )}
                            {can('in_progress') && (
                                <Button
                                    variant={variantFor('in_progress')}
                                    onClick={() => updateTourStatus('in_progress', 'Tournée partie en livraison')}
                                    disabled={busy}
                                >
                                    {spinnerOr('in_progress', <Navigation className="h-4 w-4" aria-hidden="true" />)} Départ en livraison
                                </Button>
                            )}
                            {can('completed') && (
                                <Button
                                    variant={variantFor('completed')}
                                    onClick={() => setConfirmTarget('completed')}
                                    disabled={busy}
                                >
                                    {spinnerOr('completed', <CheckCircle2 className="h-4 w-4" aria-hidden="true" />)} Terminer la tournée
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                {isClosed && (
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
                        <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
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
                                className={confirmTarget === 'cancelled' ? buttonVariants({ variant: 'destructive' }) : undefined}
                                onClick={(e) => {
                                    // On garde la boîte ouverte jusqu'à la réponse du serveur
                                    e.preventDefault()
                                    if (confirmTarget === 'cancelled') updateTourStatus('cancelled', 'Tournée annulée')
                                    else if (confirmTarget === 'completed') updateTourStatus('completed', 'Tournée terminée')
                                }}
                            >
                                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                {confirmTarget === 'cancelled' ? 'Annuler la tournée' : 'Terminer la tournée'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Indicateurs */}
                <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard
                        label="Arrêts livrés"
                        value={`${formatNumber(deliveredStops)} / ${formatNumber(totalStops)}`}
                        hint={`${progress}% de la tournée`}
                        icon={MapPin}
                        tone={progress === 100 && totalStops > 0 ? 'success' : 'brand'}
                    >
                        {totalStops > 0 && (
                            <div
                                className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                                role="progressbar"
                                aria-valuenow={progress}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label="Progression des livraisons"
                            >
                                <div
                                    className={`h-full rounded-full ${progress === 100 ? 'bg-success' : 'bg-brand'}`}
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        )}
                    </StatCard>
                    <StatCard
                        label="Produits chargés"
                        value={formatNumber(productInventory.reduce((s, i) => s + Number(i.loaded_quantity || 0), 0))}
                        hint="Unités au départ"
                        icon={Package}
                    />
                    <StatCard
                        label="Emballages chargés"
                        value={formatNumber(packagingInventory.reduce((s, i) => s + Number(i.loaded_quantity || 0), 0))}
                        hint="Unités au départ"
                        icon={PackageOpen}
                    />
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Contenu principal : arrêts + inventaire */}
                    <div className="space-y-6 lg:col-span-2">
                        <Panel
                            title="Arrêts de livraison"
                            description={`${totalStops} arrêt${totalStops > 1 ? 's' : ''} · ${progress}% complété`}
                        >
                            {tour.stops.length === 0 ? (
                                <div className="p-5">
                                    <EmptyState
                                        icon={MapPin}
                                        title="Aucun arrêt configuré"
                                        description="Cette tournée ne comporte encore aucun arrêt de livraison."
                                    />
                                </div>
                            ) : (
                                <ol className="divide-y divide-border">
                                    {tour.stops.map((stop, idx) => {
                                        const sInfo = stopStatusConfig[stop.status] || stopStatusConfig.pending
                                        return (
                                            <li
                                                key={stop.id}
                                                className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4"
                                            >
                                                <div className="flex min-w-0 flex-1 items-start gap-3">
                                                    <span
                                                        className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
                                                        aria-label={`Arrêt ${idx + 1}`}
                                                    >
                                                        {idx + 1}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium text-foreground">{stop.client_name}</p>
                                                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                                            {stop.client_zone && <span>{stop.client_zone}</span>}
                                                            {stop.client_phone && <span className="tabular">{stop.client_phone}</span>}
                                                            {stop.order_number && <span className="font-mono">{stop.order_number}</span>}
                                                        </p>
                                                    </div>
                                                    {stop.total_amount != null && (
                                                        <div className="shrink-0 text-right">
                                                            <p className="tabular text-sm font-medium text-foreground">
                                                                {formatMoney(Number(stop.total_amount))}
                                                            </p>
                                                            {Number(stop.paid_amount) < Number(stop.total_amount) && (
                                                                <p className="tabular text-xs text-destructive">
                                                                    Reste {formatMoney(Number(stop.total_amount) - Number(stop.paid_amount || 0))}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex shrink-0 items-center justify-end gap-2 pl-10 sm:pl-0">
                                                    {updatingStop === stop.id && (
                                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Mise à jour en cours" />
                                                    )}
                                                    {!isClosed && (currentStatus === 'in_progress' || currentStatus === 'loading') && stop.status === 'pending' && (
                                                        <Select
                                                            value=""
                                                            onValueChange={(val) => updateStopStatus(stop.id, val)}
                                                            disabled={updatingStop !== null || busy}
                                                        >
                                                            <SelectTrigger size="sm" className="w-32 text-xs" aria-label={`Statut de l'arrêt ${stop.client_name}`}>
                                                                <SelectValue placeholder="Marquer…" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="delivered">Livré</SelectItem>
                                                                <SelectItem value="partial">Partiel</SelectItem>
                                                                <SelectItem value="failed">Échoué</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                    <StatusBadge label={sInfo.label} tone={sInfo.tone} />
                                                </div>
                                            </li>
                                        )
                                    })}
                                </ol>
                            )}
                        </Panel>

                        {/* Inventaire du véhicule */}
                        {tour.inventory.length > 0 && (
                            <Panel title="Inventaire du véhicule" description="Chargé, déchargé, retours et casse par article">
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="pl-5">Article</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead className="text-right">Chargé</TableHead>
                                                <TableHead className="text-right">Déchargé</TableHead>
                                                <TableHead className="text-right">Retours</TableHead>
                                                <TableHead className="pr-5 text-right">Endommagé</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {tour.inventory.map(item => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="pl-5 font-medium text-foreground">
                                                        {item.product_name || item.packaging_name || '—'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <StatusBadge
                                                            label={item.inventory_type === 'product' ? 'Produit' : 'Emballage'}
                                                            tone={item.inventory_type === 'product' ? 'info' : 'default'}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="tabular text-right font-medium text-foreground">{formatNumber(item.loaded_quantity)}</TableCell>
                                                    <TableCell className="tabular text-right">{formatNumber(item.unloaded_quantity)}</TableCell>
                                                    <TableCell className="tabular text-right">{formatNumber(item.returned_quantity)}</TableCell>
                                                    <TableCell
                                                        className={`tabular pr-5 text-right ${Number(item.damaged_quantity) > 0 ? 'font-medium text-destructive' : ''}`}
                                                    >
                                                        {formatNumber(item.damaged_quantity)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </Panel>
                        )}
                    </div>

                    {/* Résumé */}
                    <div className="space-y-6">
                        <Panel title="Informations" bodyClassName="space-y-3 p-5">
                            <InfoRow label="Date" value={formatDate(tour.tour_date)} />
                            <InfoRow label="Chauffeur" value={tour.driver_name || 'Non assigné'} muted={!tour.driver_name} />
                            <InfoRow
                                label="Véhicule"
                                value={
                                    tour.vehicle_name ? (
                                        <span className="flex flex-col items-end">
                                            <span>{tour.vehicle_name}</span>
                                            {tour.vehicle_plate && (
                                                <span className="font-mono text-xs text-muted-foreground">{tour.vehicle_plate}</span>
                                            )}
                                        </span>
                                    ) : (
                                        'Non assigné'
                                    )
                                }
                                muted={!tour.vehicle_name}
                            />
                            {tour.depot_name && <InfoRow label="Dépôt" value={tour.depot_name} />}
                            {(tour.started_at || tour.completed_at || tour.created_by_name) && <Separator />}
                            {tour.started_at && <InfoRow label="Départ" value={formatDateTime(tour.started_at)} />}
                            {tour.completed_at && <InfoRow label="Fin" value={formatDateTime(tour.completed_at)} />}
                            {tour.created_by_name && <InfoRow label="Créée par" value={tour.created_by_name} />}
                        </Panel>

                        {tour.notes && (
                            <Panel title="Notes" bodyClassName="p-5">
                                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{tour.notes}</p>
                            </Panel>
                        )}
                    </div>
                </div>
            </PageShell>
        </div>
    )
}

function InfoRow({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
    return (
        <div className="flex items-start justify-between gap-4 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className={`tabular text-right font-medium ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{value}</span>
        </div>
    )
}
