'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
    ArrowLeft, Loader2, Package, Plus, Navigation, Info, Lock, Truck,
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
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Chargement du véhicule" />
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
                            onRetry={fetchAll}
                        />
                    )}
                </PageShell>
            </div>
        )
    }

    const productItems = inventory.filter(i => i.inventory_type === 'product')
    const packagingItems = inventory.filter(i => i.inventory_type === 'packaging')
    const formDisabled = saving || isClosed
    const productTotal = productItems.reduce((s, i) => s + Number(i.loaded_quantity || 0), 0)
    const packagingTotal = packagingItems.reduce((s, i) => s + Number(i.loaded_quantity || 0), 0)

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Chargement du véhicule"
                description={`Tournée du ${formatDate(tour.tour_date)} · ${tour.driver_name || 'Chauffeur non assigné'}`}
            />

            <PageShell>
                <div className="space-y-4">
                    <Button variant="ghost" size="sm" asChild className="-ml-2">
                        <Link href={`/dashboard/deliveries/${tourId}`}>
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            Tournée
                        </Link>
                    </Button>

                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 space-y-1">
                            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Chargement du véhicule</h2>
                            <p className="text-sm text-muted-foreground">
                                Tournée du {formatDate(tour.tour_date)}
                                {tour.depot_name ? ` · départ ${tour.depot_name}` : ''}
                            </p>
                        </div>
                        {inventory.length > 0 && canStartDelivery && (
                            <Button variant="brand" onClick={handleStartDelivery} disabled={starting || saving}>
                                {starting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                    <Navigation className="h-4 w-4" aria-hidden="true" />
                                )}
                                Démarrer la livraison
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-info/20 bg-info-soft p-4 text-sm text-info">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>
                        Le chargement n&apos;est pas encore déduit du stock du dépôt.
                        Les quantités saisies ici servent uniquement au suivi de la tournée.
                    </p>
                </div>

                {isClosed && (
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
                        <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Cette tournée est {tour.status === 'cancelled' ? 'annulée' : 'terminée'} : le chargement n&apos;est plus modifiable.
                    </div>
                )}

                {error && (
                    <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                        {error}
                    </div>
                )}

                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Formulaire d'ajout */}
                    <Card className="h-fit">
                        <CardHeader>
                            <CardTitle>Ajouter un article</CardTitle>
                            <CardDescription>Produits ou emballages vides chargés dans le véhicule.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="inventoryType">Type</Label>
                                <Select value={inventoryType} onValueChange={(v) => setInventoryType(v as 'product' | 'packaging')} disabled={formDisabled}>
                                    <SelectTrigger id="inventoryType" className="w-full">
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
                                    <Label htmlFor="variant">Variante produit</Label>
                                    <Select value={selectedVariant} onValueChange={setSelectedVariant} disabled={formDisabled || variants.length === 0}>
                                        <SelectTrigger id="variant" className="w-full">
                                            <SelectValue placeholder={variants.length === 0 ? 'Aucun produit en stock' : 'Choisir…'} />
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
                                    <Label htmlFor="packaging">Type d&apos;emballage</Label>
                                    <Select value={selectedPackaging} onValueChange={setSelectedPackaging} disabled={formDisabled || packagingTypes.length === 0}>
                                        <SelectTrigger id="packaging" className="w-full">
                                            <SelectValue placeholder={packagingTypes.length === 0 ? "Aucun type d'emballage" : 'Choisir…'} />
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
                                <Label htmlFor="quantity">Quantité à charger</Label>
                                <Input
                                    id="quantity"
                                    type="number"
                                    min="1"
                                    inputMode="numeric"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    placeholder="Ex. 50"
                                    className="tabular"
                                    disabled={formDisabled}
                                />
                                <p className="text-xs text-muted-foreground">Nombre entier d&apos;unités.</p>
                            </div>

                            <Button onClick={handleAddItem} disabled={formDisabled || !quantity} className="w-full">
                                {saving ? (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                )}
                                Charger
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Inventaire chargé */}
                    <div className="space-y-6 lg:col-span-2">
                        {productItems.length > 0 && (
                            <Panel
                                title="Produits chargés"
                                description={`${productItems.length} article${productItems.length > 1 ? 's' : ''}`}
                                action={<span className="tabular text-sm font-medium text-foreground">{formatNumber(productTotal)} unités</span>}
                            >
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="pl-5">Produit</TableHead>
                                            <TableHead className="pr-5 text-right">Quantité</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {productItems.map(item => (
                                            <TableRow key={item.id}>
                                                <TableCell className="pl-5">
                                                    <span className="font-medium text-foreground">{item.product_name}</span>
                                                    {item.packaging_name && (
                                                        <span className="ml-2 text-xs text-muted-foreground">{item.packaging_name}</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="tabular pr-5 text-right font-medium text-foreground">
                                                    {formatNumber(item.loaded_quantity)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Panel>
                        )}

                        {packagingItems.length > 0 && (
                            <Panel
                                title="Emballages vides chargés"
                                description={`${packagingItems.length} article${packagingItems.length > 1 ? 's' : ''}`}
                                action={<span className="tabular text-sm font-medium text-foreground">{formatNumber(packagingTotal)} unités</span>}
                            >
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="pl-5">Emballage</TableHead>
                                            <TableHead className="pr-5 text-right">Quantité</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {packagingItems.map(item => (
                                            <TableRow key={item.id}>
                                                <TableCell className="pl-5 font-medium text-foreground">
                                                    {item.packaging_name || '—'}
                                                </TableCell>
                                                <TableCell className="tabular pr-5 text-right font-medium text-foreground">
                                                    {formatNumber(item.loaded_quantity)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Panel>
                        )}

                        {inventory.length === 0 && (
                            <EmptyState
                                icon={Package}
                                title="Aucun article chargé"
                                description={isClosed
                                    ? "Aucun article n'a été chargé pour cette tournée."
                                    : 'Utilisez le formulaire pour ajouter des produits et emballages.'}
                                className="bg-card"
                            />
                        )}
                    </div>
                </div>
            </PageShell>
        </div>
    )
}
