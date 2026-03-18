'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
    ArrowLeft, Truck, MapPin, User, Calendar, Clock, CheckCircle2,
    PlayCircle, Package, Loader2, Navigation, AlertTriangle, PackageOpen,
    XCircle, RotateCcw,
} from 'lucide-react'
import Link from 'next/link'

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

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    planned: { label: 'Planifiée', color: 'bg-slate-100 text-slate-600', icon: Clock },
    loading: { label: 'Chargement', color: 'bg-amber-100 text-amber-600', icon: PlayCircle },
    in_progress: { label: 'En route', color: 'bg-blue-100 text-blue-600', icon: Navigation },
    completed: { label: 'Terminée', color: 'bg-emerald-100 text-emerald-600', icon: CheckCircle2 },
    cancelled: { label: 'Annulée', color: 'bg-rose-100 text-rose-600', icon: XCircle },
}

const stopStatusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'En attente', color: 'bg-slate-100 text-slate-500' },
    delivered: { label: 'Livré', color: 'bg-emerald-100 text-emerald-600' },
    partial: { label: 'Partiel', color: 'bg-amber-100 text-amber-600' },
    failed: { label: 'Échoué', color: 'bg-rose-100 text-rose-600' },
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(amount)
}

export default function DeliveryDetailPage() {
    const params = useParams()
    const router = useRouter()
    const tourId = params.id as string

    const [tour, setTour] = useState<TourDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [updating, setUpdating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchTour = useCallback(async () => {
        try {
            const res = await fetch(`/api/deliveries/${tourId}`)
            const data = await res.json()
            if (res.ok && data.data) {
                setTour(data.data)
            } else {
                setError(data.error || 'Erreur de chargement')
            }
        } catch {
            setError('Erreur réseau')
        } finally {
            setLoading(false)
        }
    }, [tourId])

    useEffect(() => { fetchTour() }, [fetchTour])

    async function updateTourStatus(newStatus: string) {
        setUpdating(true)
        try {
            const res = await fetch(`/api/deliveries/${tourId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            })
            if (res.ok) fetchTour()
        } catch { /* ignore */ }
        finally { setUpdating(false) }
    }

    async function updateStopStatus(stopId: string, status: string) {
        try {
            await fetch(`/api/deliveries/${tourId}/stops`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stopId, status }),
            })
            fetchTour()
        } catch { /* ignore */ }
    }

    if (loading) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Détail Tournée" description="Chargement..." />
                <main className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </main>
            </div>
        )
    }

    if (error || !tour) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Tournée introuvable" description="" />
                <main className="flex-1 p-6">
                    <div className="text-center py-12">
                        <p className="text-destructive font-bold">{error || 'Tournée introuvable'}</p>
                        <Button variant="outline" className="mt-4" asChild>
                            <Link href="/dashboard/deliveries">Retour</Link>
                        </Button>
                    </div>
                </main>
            </div>
        )
    }

    const statusInfo = statusConfig[tour.status] || statusConfig.planned
    const StatusIcon = statusInfo.icon
    const deliveredStops = tour.stops.filter(s => s.status === 'delivered').length
    const totalStops = tour.stops.length
    const progress = totalStops > 0 ? Math.round((deliveredStops / totalStops) * 100) : 0

    const productInventory = tour.inventory.filter(i => i.inventory_type === 'product')
    const packagingInventory = tour.inventory.filter(i => i.inventory_type === 'packaging')

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title={`Tournée du ${new Date(tour.tour_date).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`}
                description="Gestion complète de la tournée de livraison"
            />

            <main className="flex-1 p-4 lg:p-6 space-y-6 ">
                {/* Actions bar */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <Button variant="ghost" size="sm" asChild className="rounded-xl border border-slate-200">
                        <Link href="/dashboard/deliveries">
                            <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                        </Link>
                    </Button>
                    <div className="flex gap-3 flex-wrap">
                        {tour.status === 'planned' && (
                            <Button
                                onClick={() => updateTourStatus('loading')}
                                disabled={updating}
                                className="rounded-xl bg-amber-600 hover:bg-amber-700 font-bold h-10 px-6"
                            >
                                <PlayCircle className="h-4 w-4 mr-2" /> Démarrer chargement
                            </Button>
                        )}
                        {tour.status === 'loading' && (
                            <Button
                                onClick={() => updateTourStatus('in_progress')}
                                disabled={updating}
                                className="rounded-xl bg-blue-600 hover:bg-blue-700 font-bold h-10 px-6"
                            >
                                <Navigation className="h-4 w-4 mr-2" /> Départ livraison
                            </Button>
                        )}
                        {tour.status === 'in_progress' && (
                            <Button
                                onClick={() => updateTourStatus('completed')}
                                disabled={updating}
                                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold h-10 px-6"
                            >
                                <CheckCircle2 className="h-4 w-4 mr-2" /> Terminer la tournée
                            </Button>
                        )}
                        {tour.status === 'loading' && (
                            <Button variant="outline" asChild className="rounded-xl font-bold h-10 px-6">
                                <Link href={`/dashboard/deliveries/${tour.id}/load`}>
                                    <Package className="h-4 w-4 mr-2" /> Gérer le chargement
                                </Link>
                            </Button>
                        )}
                    </div>
                </div>

                {/* Stats row */}
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    <Card className="rounded-[2rem] border-slate-200/60">
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${statusInfo.color}`}>
                                <StatusIcon className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Statut</p>
                                <p className="text-lg font-semibold text-slate-950">{statusInfo.label}</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="rounded-[2rem] border-slate-200/60">
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                                <MapPin className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Arrêts</p>
                                <p className="text-lg font-semibold text-slate-950">{deliveredStops}/{totalStops}</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="rounded-[2rem] border-slate-200/60">
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                                <Package className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Produits chargés</p>
                                <p className="text-lg font-semibold text-slate-950">
                                    {productInventory.reduce((s, i) => s + i.loaded_quantity, 0)}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="rounded-[2rem] border-slate-200/60">
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                                <PackageOpen className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Emb. chargés</p>
                                <p className="text-lg font-semibold text-slate-950">
                                    {packagingInventory.reduce((s, i) => s + i.loaded_quantity, 0)}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main: Stops */}
                    <div className="lg:col-span-2 space-y-6">
                        <Card className="rounded-lg border-slate-200/60 shadow-sm overflow-hidden">
                            <CardHeader className="px-8 py-6 border-b border-slate-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-xl font-semibold text-slate-950">Arrêts de livraison</CardTitle>
                                        <CardDescription>
                                            {totalStops} arrêt{totalStops > 1 ? 's' : ''} — {progress}% complété
                                        </CardDescription>
                                    </div>
                                    {totalStops > 0 && (
                                        <div className="flex items-center gap-2 w-32">
                                            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${progress === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                            <span className="text-xs font-semibold text-slate-400">{progress}%</span>
                                        </div>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {tour.stops.length === 0 ? (
                                    <div className="text-center py-16">
                                        <MapPin className="h-10 w-10 mx-auto text-slate-300" />
                                        <p className="text-sm text-muted-foreground mt-3">Aucun arrêt configuré</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-50">
                                        {tour.stops.map((stop, idx) => {
                                            const sInfo = stopStatusConfig[stop.status] || stopStatusConfig.pending
                                            return (
                                                <div key={stop.id} className="flex items-center gap-4 px-8 py-5 hover:bg-slate-50/50 transition-colors">
                                                    <div className="flex flex-col items-center gap-1 shrink-0 w-8">
                                                        <span className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-semibold">
                                                            {idx + 1}
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-slate-950 truncate">{stop.client_name}</p>
                                                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                                                            {stop.client_zone && <span className="font-bold">{stop.client_zone}</span>}
                                                            {stop.client_phone && <span>{stop.client_phone}</span>}
                                                            {stop.order_number && (
                                                                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                                                                    {stop.order_number}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {stop.total_amount != null && (
                                                            <p className="text-xs font-bold text-slate-500 mt-1">
                                                                {formatCurrency(Number(stop.total_amount))}
                                                                {Number(stop.paid_amount) < Number(stop.total_amount) && (
                                                                    <span className="text-rose-500 ml-2">
                                                                        (reste {formatCurrency(Number(stop.total_amount) - Number(stop.paid_amount || 0))})
                                                                    </span>
                                                                )}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3 shrink-0">
                                                        {(tour.status === 'in_progress' || tour.status === 'loading') && stop.status === 'pending' && (
                                                            <Select onValueChange={(val) => updateStopStatus(stop.id, val)}>
                                                                <SelectTrigger className="h-8 w-32 rounded-lg text-xs">
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
                            <Card className="rounded-lg border-slate-200/60 shadow-sm overflow-hidden">
                                <CardHeader className="px-8 py-6 border-b border-slate-100">
                                    <CardTitle className="text-xl font-semibold text-slate-950">Inventaire Véhicule</CardTitle>
                                    <CardDescription>Chargé / Déchargé / Retours / Endommagé</CardDescription>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader className="bg-slate-50/50">
                                            <TableRow className="border-none">
                                                <TableHead className="py-4 pl-8 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Article</TableHead>
                                                <TableHead className="py-4 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Type</TableHead>
                                                <TableHead className="py-4 text-center font-semibold uppercase text-[10px] tracking-wider text-blue-500">Chargé</TableHead>
                                                <TableHead className="py-4 text-center font-semibold uppercase text-[10px] tracking-wider text-emerald-500">Déchargé</TableHead>
                                                <TableHead className="py-4 text-center font-semibold uppercase text-[10px] tracking-wider text-amber-500">Retours</TableHead>
                                                <TableHead className="py-4 text-center pr-8 font-semibold uppercase text-[10px] tracking-wider text-rose-500">Endommagé</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {tour.inventory.map(item => (
                                                <TableRow key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                                    <TableCell className="py-4 pl-8 font-semibold text-slate-950">
                                                        {item.product_name || item.packaging_name || '—'}
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <Badge className={`rounded-lg px-2.5 py-0.5 text-[9px] font-semibold uppercase border-none ${
                                                            item.inventory_type === 'product' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                                                        }`}>
                                                            {item.inventory_type === 'product' ? 'Produit' : 'Emballage'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="py-4 text-center font-semibold text-blue-600">{item.loaded_quantity}</TableCell>
                                                    <TableCell className="py-4 text-center font-semibold text-emerald-600">{item.unloaded_quantity}</TableCell>
                                                    <TableCell className="py-4 text-center font-semibold text-amber-600">{item.returned_quantity}</TableCell>
                                                    <TableCell className="py-4 text-center pr-8 font-semibold text-rose-600">{item.damaged_quantity}</TableCell>
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
                        <Card className="rounded-lg border-slate-200/60 shadow-sm">
                            <CardHeader className="px-8 py-6 border-b border-slate-100">
                                <CardTitle className="text-lg font-semibold text-slate-950">Informations</CardTitle>
                            </CardHeader>
                            <CardContent className="p-8 space-y-5">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2 text-slate-400">
                                        <Calendar className="h-4 w-4" />
                                        <span className="text-[10px] font-semibold uppercase tracking-wider">Date</span>
                                    </div>
                                    <span className="text-sm font-semibold text-slate-950">
                                        {new Date(tour.tour_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                    </span>
                                </div>
                                <Separator />
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2 text-slate-400">
                                        <User className="h-4 w-4" />
                                        <span className="text-[10px] font-semibold uppercase tracking-wider">Chauffeur</span>
                                    </div>
                                    <span className="text-sm font-semibold text-slate-950">{tour.driver_name || 'Non assigné'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2 text-slate-400">
                                        <Truck className="h-4 w-4" />
                                        <span className="text-[10px] font-semibold uppercase tracking-wider">Véhicule</span>
                                    </div>
                                    <span className="text-sm font-semibold text-slate-950">
                                        {tour.vehicle_name || 'Non assigné'}
                                        {tour.vehicle_plate && <code className="ml-1 text-xs bg-slate-100 px-1.5 py-0.5 rounded">{tour.vehicle_plate}</code>}
                                    </span>
                                </div>
                                {tour.depot_name && (
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2 text-slate-400">
                                            <Package className="h-4 w-4" />
                                            <span className="text-[10px] font-semibold uppercase tracking-wider">Dépôt</span>
                                        </div>
                                        <span className="text-sm font-semibold text-slate-950">{tour.depot_name}</span>
                                    </div>
                                )}
                                <Separator />
                                {tour.started_at && (
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2 text-slate-400">
                                            <Clock className="h-4 w-4" />
                                            <span className="text-[10px] font-semibold uppercase tracking-wider">Départ</span>
                                        </div>
                                        <span className="text-xs font-bold text-slate-600">
                                            {new Date(tour.started_at).toLocaleString('fr-FR')}
                                        </span>
                                    </div>
                                )}
                                {tour.completed_at && (
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2 text-slate-400">
                                            <CheckCircle2 className="h-4 w-4" />
                                            <span className="text-[10px] font-semibold uppercase tracking-wider">Fin</span>
                                        </div>
                                        <span className="text-xs font-bold text-slate-600">
                                            {new Date(tour.completed_at).toLocaleString('fr-FR')}
                                        </span>
                                    </div>
                                )}
                                {tour.created_by_name && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Créé par</span>
                                        <span className="text-xs font-bold text-slate-600">{tour.created_by_name}</span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {tour.notes && (
                            <Card className="rounded-lg border-slate-200/60 shadow-sm">
                                <CardHeader className="px-8 py-5 border-b border-slate-100">
                                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-400">Notes</CardTitle>
                                </CardHeader>
                                <CardContent className="p-8">
                                    <p className="text-sm font-medium text-slate-600 italic leading-relaxed">&ldquo;{tour.notes}&rdquo;</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
