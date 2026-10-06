'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
    ArrowLeft, Loader2, Package, Plus, Navigation, PackageOpen, Info, Lock, Truck,
} from 'lucide-react'
import Link from 'next/link'
import { ApiError, apiFetch, errorMessage, toastError, toastWarnings } from '@/lib/api-client'
import { formatDate, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'

interface ProductVariant {
    id: string
    product_name: string
    packaging_name: string
    price: number
}

interface PackagingType {
    id: string
    name: string
    units_per_case: number
}

interface InventoryItem {
    id: string
    inventory_type: string
    product_name: string | null
    packaging_name: string | null
    loaded_quantity: number
    unloaded_quantity: number
    returned_quantity: number
    damaged_quantity: number
}

interface TourBasic {
    id: string
    status: string
    tour_date: string
    driver_name: string | null
    depot_name: string | null
}

export default function LoadTourPage() {
    const params = useParams()
    const router = useRouter()
    const tourId = params.id as string

    const [tour, setTour] = useState<TourBasic | null>(null)
    const [inventory, setInventory] = useState<InventoryItem[]>([])
    const [variants, setVariants] = useState<ProductVariant[]>([])
    const [packagingTypes, setPackagingTypes] = useState<PackagingType[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<{ notFound: boolean; message: string } | null>(null)
    const [saving, setSaving] = useState(false)
    const [starting, setStarting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Form state
    const [inventoryType, setInventoryType] = useState<'product' | 'packaging'>('product')
    const [selectedVariant, setSelectedVariant] = useState('')
    const [selectedPackaging, setSelectedPackaging] = useState('')
    const [quantity, setQuantity] = useState('')

    /** Tournée + inventaire du véhicule (indispensables à l'écran). */
    const fetchTourData = useCallback(async () => {
        const [tourData, invData] = await Promise.all([
            apiFetch<{ data: TourBasic }>(`/api/deliveries/${tourId}`),
            apiFetch<{ data: InventoryItem[] }>(`/api/deliveries/${tourId}/inventory`),
        ])
        setTour(tourData.data)
        setInventory(invData.data || [])
    }, [tourId])

    /** Catalogue (variantes en stock + types d'emballage) : un échec n'empêche pas d'afficher la tournée. */
    const fetchCatalog = useCallback(async () => {
        const [varRes, pkgRes] = await Promise.allSettled([
            apiFetch('/api/stock'),
            apiFetch('/api/packaging'),
        ])
        if (varRes.status === 'fulfilled') {
            // Variantes uniques à partir des lignes de stock (une ligne par dépôt / lot)
            const seen = new Set<string>()
            const uniqueVariants: ProductVariant[] = []
            for (const item of varRes.value?.data || []) {
                if (!seen.has(item.variant_id)) {
                    seen.add(item.variant_id)
                    uniqueVariants.push({
                        id: item.variant_id,
                        product_name: item.product_name,
                        packaging_name: item.packaging_name || 'Standard',
                        price: item.price,
                    })
                }
            }
            setVariants(uniqueVariants)
        } else {
            toastError(varRes.reason, 'Liste des produits indisponible')
        }
        if (pkgRes.status === 'fulfilled') {
            setPackagingTypes(pkgRes.value?.data || pkgRes.value?.packagingTypes || [])
        } else {
            toastError(pkgRes.reason, "Liste des emballages indisponible")
        }
    }, [])

    const fetchAll = useCallback(async () => {
        setLoading(true)
        setLoadError(null)
        try {
            await Promise.all([fetchTourData(), fetchCatalog()])
        } catch (e) {
            setLoadError({
                notFound: e instanceof ApiError && e.status === 404,
                message: errorMessage(e),
            })
        } finally {
            setLoading(false)
        }
    }, [fetchTourData, fetchCatalog])

    useEffect(() => { fetchAll() }, [fetchAll])

    const isClosed = tour?.status === 'completed' || tour?.status === 'cancelled'
    const canStartDelivery = tour?.status === 'planned' || tour?.status === 'loading'

    async function handleAddItem() {
        if (saving || isClosed) return
        setError(null)

        const qty = Number(quantity)
        if (!Number.isInteger(qty) || qty <= 0) {
            setError('Saisissez une quantité entière supérieure à 0.')
            return
        }
        const body: Record<string, unknown> = {
            inventoryType,
            loadedQuantity: qty,
        }
        if (inventoryType === 'product') {
            if (!selectedVariant) { setError('Choisissez une variante produit.'); return }
            body.productVariantId = selectedVariant
        } else {
            if (!selectedPackaging) { setError("Choisissez un type d'emballage."); return }
            body.packagingTypeId = selectedPackaging
        }

        setSaving(true)
        try {
            const res = await apiFetch(`/api/deliveries/${tourId}/inventory`, {
                method: 'POST',
                body,
            })
            toast.success('Article chargé dans le véhicule')
            toastWarnings(res?.warnings)
            setQuantity('')
            setSelectedVariant('')
            setSelectedPackaging('')
            try {
                await fetchTourData()
            } catch (e) {
                toastError(e, 'Actualisation impossible')
            }
        } catch (e) {
            setError(errorMessage(e))
            // Tournée clôturée entre-temps : on resynchronise le statut
            if (e instanceof ApiError && e.status === 409) fetchTourData().catch(() => {})
        } finally {
            setSaving(false)
        }
    }

    async function handleStartDelivery() {
        if (starting) return
        setStarting(true)
        try {
            const res = await apiFetch(`/api/deliveries/${tourId}`, {
                method: 'PATCH',
                body: { status: 'in_progress' },
            })
            toast.success('Tournée partie en livraison')
            toastWarnings(res?.warnings)
            router.push(`/dashboard/deliveries/${tourId}`)
        } catch (e) {
            toastError(e, 'Départ en livraison impossible')
            setStarting(false)
        }
    }

    if (loading) {
        return <PageSkeleton />
    }

    if (loadError || !tour) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Chargement du véhicule" description="" />
                <main className="flex-1 p-6">
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
                            onRetry={fetchAll}
                        />
                    )}
                </main>
            </div>
        )
    }

    const productItems = inventory.filter(i => i.inventory_type === 'product')
    const packagingItems = inventory.filter(i => i.inventory_type === 'packaging')
    const formDisabled = saving || isClosed

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title="Chargement du véhicule"
                description={`Tournée du ${formatDate(tour.tour_date)} — ${tour.driver_name || 'Chauffeur non assigné'}`}
            />

            <main className="flex-1 p-4 lg:p-6 space-y-6 ">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <Button variant="ghost" size="sm" asChild className="rounded-xl border border-slate-200">
                        <Link href={`/dashboard/deliveries/${tourId}`}>
                            <ArrowLeft className="h-4 w-4 mr-2" /> Retour à la tournée
                        </Link>
                    </Button>
                    {inventory.length > 0 && canStartDelivery && (
                        <Button
                            onClick={handleStartDelivery}
                            disabled={starting || saving}
                            className="rounded-xl bg-blue-600 hover:bg-blue-700 font-bold h-10 px-6 shadow-lg shadow-blue-500/20"
                        >
                            {starting ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Navigation className="h-4 w-4 mr-2" />
                            )}
                            Démarrer la livraison
                        </Button>
                    )}
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-800">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                    <p>
                        Le chargement n&apos;est pas encore déduit du stock du dépôt.
                        Les quantités saisies ici servent uniquement au suivi de la tournée.
                    </p>
                </div>

                {isClosed && (
                    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
                        <Lock className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
                        Cette tournée est {tour.status === 'cancelled' ? 'annulée' : 'terminée'} : le chargement n&apos;est plus modifiable.
                    </div>
                )}

                {error && (
                    <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Add item form */}
                    <Card className="rounded-lg border-slate-200/60 shadow-sm">
                        <CardHeader className="px-8 py-6 border-b border-slate-100">
                            <CardTitle className="text-lg font-semibold text-slate-950">Ajouter un article</CardTitle>
                            <CardDescription>Chargez des produits ou emballages dans le véhicule</CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 space-y-5">
                            <div className="space-y-2">
                                <Label>Type</Label>
                                <Select value={inventoryType} onValueChange={(v) => setInventoryType(v as 'product' | 'packaging')} disabled={formDisabled}>
                                    <SelectTrigger className="rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="product">Produit</SelectItem>
                                        <SelectItem value="packaging">Emballage vide</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {inventoryType === 'product' ? (
                                <div className="space-y-2">
                                    <Label>Variante produit</Label>
                                    <Select value={selectedVariant} onValueChange={setSelectedVariant} disabled={formDisabled || variants.length === 0}>
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue placeholder={variants.length === 0 ? 'Aucun produit en stock' : 'Choisir...'} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {variants.map(v => (
                                                <SelectItem key={v.id} value={v.id}>
                                                    {v.product_name} — {v.packaging_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <Label>Type d&apos;emballage</Label>
                                    <Select value={selectedPackaging} onValueChange={setSelectedPackaging} disabled={formDisabled || packagingTypes.length === 0}>
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue placeholder={packagingTypes.length === 0 ? "Aucun type d'emballage" : 'Choisir...'} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {packagingTypes.map(pt => (
                                                <SelectItem key={pt.id} value={pt.id}>
                                                    {pt.name} ({pt.units_per_case} u/casier)
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label>Quantité à charger</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    placeholder="Ex: 50"
                                    className="rounded-xl"
                                    disabled={formDisabled}
                                />
                            </div>

                            <Button
                                onClick={handleAddItem}
                                disabled={formDisabled || !quantity}
                                className="w-full rounded-xl"
                            >
                                {saving ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Plus className="h-4 w-4 mr-2" />
                                )}
                                Charger
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Loaded inventory */}
                    <div className="lg:col-span-2 space-y-6">
                        {productItems.length > 0 && (
                            <Card className="rounded-lg border-slate-200/60 shadow-sm overflow-hidden">
                                <CardHeader className="px-8 py-5 border-b border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <Package className="h-5 w-5 text-blue-600" />
                                        <CardTitle className="text-lg font-semibold text-slate-950">Produits chargés</CardTitle>
                                        <Badge className="bg-blue-50 text-blue-600 border-none font-semibold text-xs">
                                            {formatNumber(productItems.reduce((s, i) => s + Number(i.loaded_quantity || 0), 0))} unités
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader className="bg-slate-50/50">
                                            <TableRow className="border-none">
                                                <TableHead className="py-3 pl-8 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Produit</TableHead>
                                                <TableHead className="py-3 text-right pr-8 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Quantité</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {productItems.map(item => (
                                                <TableRow key={item.id} className="border-b border-slate-50">
                                                    <TableCell className="py-4 pl-8">
                                                        <span className="font-semibold text-slate-950">{item.product_name}</span>
                                                        {item.packaging_name && (
                                                            <span className="ml-2 text-xs text-slate-400">({item.packaging_name})</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="py-4 text-right pr-8 font-semibold text-blue-600 text-lg">
                                                        {formatNumber(item.loaded_quantity)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        )}

                        {packagingItems.length > 0 && (
                            <Card className="rounded-lg border-slate-200/60 shadow-sm overflow-hidden">
                                <CardHeader className="px-8 py-5 border-b border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <PackageOpen className="h-5 w-5 text-amber-600" />
                                        <CardTitle className="text-lg font-semibold text-slate-950">Emballages vides chargés</CardTitle>
                                        <Badge className="bg-amber-50 text-amber-600 border-none font-semibold text-xs">
                                            {formatNumber(packagingItems.reduce((s, i) => s + Number(i.loaded_quantity || 0), 0))} unités
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader className="bg-slate-50/50">
                                            <TableRow className="border-none">
                                                <TableHead className="py-3 pl-8 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Emballage</TableHead>
                                                <TableHead className="py-3 text-right pr-8 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Quantité</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {packagingItems.map(item => (
                                                <TableRow key={item.id} className="border-b border-slate-50">
                                                    <TableCell className="py-4 pl-8 font-semibold text-slate-950">
                                                        {item.packaging_name || '—'}
                                                    </TableCell>
                                                    <TableCell className="py-4 text-right pr-8 font-semibold text-amber-600 text-lg">
                                                        {formatNumber(item.loaded_quantity)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        )}

                        {inventory.length === 0 && (
                            <EmptyState
                                icon={Package}
                                title="Aucun article chargé"
                                description={isClosed
                                    ? "Aucun article n'a été chargé pour cette tournée."
                                    : 'Utilisez le formulaire pour ajouter des produits et emballages.'}
                                className="bg-white"
                            />
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
