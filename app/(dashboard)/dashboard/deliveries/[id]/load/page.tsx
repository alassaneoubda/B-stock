'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
    ArrowLeft, Loader2, Package, Plus, Trash2, Navigation, PackageOpen,
} from 'lucide-react'
import Link from 'next/link'

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
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Form state
    const [inventoryType, setInventoryType] = useState<'product' | 'packaging'>('product')
    const [selectedVariant, setSelectedVariant] = useState('')
    const [selectedPackaging, setSelectedPackaging] = useState('')
    const [quantity, setQuantity] = useState('')

    const fetchData = useCallback(async () => {
        try {
            const [tourRes, invRes, varRes, pkgRes] = await Promise.all([
                fetch(`/api/deliveries/${tourId}`),
                fetch(`/api/deliveries/${tourId}/inventory`),
                fetch('/api/stock'),
                fetch('/api/packaging'),
            ])

            const tourData = await tourRes.json()
            const invData = await invRes.json()
            const varData = await varRes.json()
            const pkgData = await pkgRes.json()

            if (tourData.data) {
                setTour(tourData.data)
            }
            if (invData.data) {
                setInventory(invData.data)
            }
            // Extract unique variants from stock data
            if (varData.data) {
                const seen = new Set<string>()
                const uniqueVariants: ProductVariant[] = []
                for (const item of varData.data) {
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
            }
            if (pkgData.packagingTypes) {
                setPackagingTypes(pkgData.packagingTypes)
            }
        } catch {
            setError('Erreur de chargement')
        } finally {
            setLoading(false)
        }
    }, [tourId])

    useEffect(() => { fetchData() }, [fetchData])

    async function handleAddItem() {
        if (!quantity || Number(quantity) <= 0) return
        setSaving(true)
        setError(null)

        try {
            const body: Record<string, unknown> = {
                inventoryType,
                loadedQuantity: Number(quantity),
            }
            if (inventoryType === 'product') {
                if (!selectedVariant) { setSaving(false); return }
                body.productVariantId = selectedVariant
            } else {
                if (!selectedPackaging) { setSaving(false); return }
                body.packagingTypeId = selectedPackaging
            }

            const res = await fetch(`/api/deliveries/${tourId}/inventory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error || 'Erreur')
                return
            }
            setQuantity('')
            setSelectedVariant('')
            setSelectedPackaging('')
            fetchData()
        } catch {
            setError('Erreur réseau')
        } finally {
            setSaving(false)
        }
    }

    async function handleStartDelivery() {
        setSaving(true)
        try {
            const res = await fetch(`/api/deliveries/${tourId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'in_progress' }),
            })
            if (res.ok) {
                router.push(`/dashboard/deliveries/${tourId}`)
            }
        } catch { /* ignore */ }
        finally { setSaving(false) }
    }

    if (loading) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Chargement véhicule" description="Chargement..." />
                <main className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </main>
            </div>
        )
    }

    const productItems = inventory.filter(i => i.inventory_type === 'product')
    const packagingItems = inventory.filter(i => i.inventory_type === 'packaging')

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title="Chargement du véhicule"
                description={tour ? `Tournée du ${new Date(tour.tour_date).toLocaleDateString('fr-FR')} — ${tour.driver_name || 'Chauffeur non assigné'}` : ''}
            />

            <main className="flex-1 p-4 lg:p-6 space-y-6 ">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <Button variant="ghost" size="sm" asChild className="rounded-xl border border-slate-200">
                        <Link href={`/dashboard/deliveries/${tourId}`}>
                            <ArrowLeft className="h-4 w-4 mr-2" /> Retour à la tournée
                        </Link>
                    </Button>
                    {inventory.length > 0 && (
                        <Button
                            onClick={handleStartDelivery}
                            disabled={saving}
                            className="rounded-xl bg-blue-600 hover:bg-blue-700 font-bold h-10 px-6 shadow-lg shadow-blue-500/20"
                        >
                            <Navigation className="h-4 w-4 mr-2" /> Démarrer la livraison
                        </Button>
                    )}
                </div>

                {error && (
                    <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
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
                                <Select value={inventoryType} onValueChange={(v) => setInventoryType(v as 'product' | 'packaging')}>
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
                                    <Select value={selectedVariant} onValueChange={setSelectedVariant}>
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue placeholder="Choisir..." />
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
                                    <Select value={selectedPackaging} onValueChange={setSelectedPackaging}>
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue placeholder="Choisir..." />
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
                                />
                            </div>

                            <Button
                                onClick={handleAddItem}
                                disabled={saving || !quantity}
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
                                            {productItems.reduce((s, i) => s + i.loaded_quantity, 0)} unités
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
                                                        {item.loaded_quantity}
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
                                            {packagingItems.reduce((s, i) => s + i.loaded_quantity, 0)} unités
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
                                                        {item.loaded_quantity}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        )}

                        {inventory.length === 0 && (
                            <Card className="rounded-lg border-slate-200/60 shadow-sm">
                                <CardContent className="py-16 text-center">
                                    <Package className="h-12 w-12 mx-auto text-slate-300" />
                                    <p className="text-sm text-muted-foreground mt-4 font-medium">
                                        Aucun article chargé. Utilisez le formulaire pour ajouter des produits et emballages.
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
