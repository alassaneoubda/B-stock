'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
    Loader2,
    ArrowLeft,
    Search,
    Plus,
    Trash2,
    ChevronRight,
    AlertTriangle,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch, toastError } from '@/lib/api-client'
import { formatMoney, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'

interface Supplier {
    id: string
    name: string
    type: string | null
    phone: string | null
}

interface ProductVariant {
    id: string
    product_name: string
    volume: string | null
    packaging_name: string | null
    purchase_price: number | null
}

interface Depot {
    id: string
    name: string
    is_main: boolean
}

interface POItem {
    variantId: string
    productName: string
    packagingName: string | null
    volume: string | null
    quantity: number
    unitPrice: number
}

type Step = 'supplier' | 'products' | 'review'

/** « Coca-Cola (33cl) · Casier 24 » */
function variantLabel(name: string, packaging: string | null, volume: string | null) {
    return [name, volume ? `(${volume})` : '', packaging ? `· ${packaging}` : ''].filter(Boolean).join(' ')
}

const INVALID_ITEM_MESSAGE = 'quantité entière supérieure à 0 et prix positif requis.'

export default function NewProcurementPage() {
    const router = useRouter()
    const [step, setStep] = useState<Step>('supplier')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Data
    const [suppliers, setSuppliers] = useState<Supplier[]>([])
    const [variants, setVariants] = useState<ProductVariant[]>([])
    const [depots, setDepots] = useState<Depot[]>([])

    // Selections
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
    const [selectedDepot, setSelectedDepot] = useState<string>('')
    const [items, setItems] = useState<POItem[]>([])
    const [expectedDate, setExpectedDate] = useState('')
    const [notes, setNotes] = useState('')

    // UI State
    const [supplierSearch, setSupplierSearch] = useState('')
    const [productSearch, setProductSearch] = useState('')
    const [loadingData, setLoadingData] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)

    const loadData = useCallback(async () => {
        setLoadingData(true)
        setLoadError(null)
        try {
            const [sData, dData, pData] = await Promise.all([
                apiFetch('/api/suppliers'),
                apiFetch('/api/depots'),
                apiFetch('/api/products?includeVariants=true')
            ])
            const supplierList: Supplier[] = sData.data || sData.suppliers || []
            const depotList: Depot[] = dData.data || dData.depots || []
            setSuppliers(supplierList)
            setDepots(depotList)
            if (depotList.length > 0) {
                const main = depotList.find((d) => d.is_main)
                setSelectedDepot(main ? main.id : depotList[0].id)
            }

            const flattenedVariants: ProductVariant[] = []
            if (pData.data) {
                pData.data.forEach((product: any) => {
                    if (product.variants && Array.isArray(product.variants)) {
                        product.variants.forEach((v: any) => {
                            flattenedVariants.push({
                                id: v.id,
                                product_name: product.name,
                                volume: product.base_unit || '',
                                packaging_name: v.packaging_name,
                                purchase_price: v.cost_price || product.purchase_price
                            })
                        })
                    }
                })
            }
            setVariants(flattenedVariants)
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : 'Impossible de charger les données.')
        } finally {
            setLoadingData(false)
        }
    }, [])

    useEffect(() => {
        loadData()
    }, [loadData])

    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(supplierSearch.toLowerCase())
    )

    const filteredVariants = variants.filter(v =>
        `${v.product_name} ${v.packaging_name || ''}`.toLowerCase().includes(productSearch.toLowerCase())
    )

    // Mêmes règles que l'API : quantité entière > 0, prix ≥ 0
    const invalidItem = items.find(i =>
        !Number.isInteger(i.quantity) || i.quantity <= 0 || !Number.isFinite(i.unitPrice) || i.unitPrice < 0
    )

    function addItem(variant: ProductVariant) {
        if (items.find(i => i.variantId === variant.id)) return
        setItems([...items, {
            variantId: variant.id,
            productName: variant.product_name,
            packagingName: variant.packaging_name,
            volume: variant.volume,
            quantity: 1,
            unitPrice: Number(variant.purchase_price || 0)
        }])
        setProductSearch('')
    }

    function removeItem(id: string) {
        setItems(items.filter(i => i.variantId !== id))
    }

    function updateItem(id: string, field: keyof POItem, value: any) {
        setItems(items.map(i => i.variantId === id ? { ...i, [field]: value } : i))
    }

    const totalAmount = items.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0)

    async function handleSubmit() {
        if (!selectedSupplier || !selectedDepot || items.length === 0 || isLoading) return
        if (invalidItem) {
            setError(`${invalidItem.productName} : ${INVALID_ITEM_MESSAGE}`)
            return
        }
        setIsLoading(true)
        setError(null)

        try {
            const data = await apiFetch<{ data: { id: string }; message?: string }>('/api/procurement', {
                method: 'POST',
                body: {
                    supplierId: selectedSupplier.id,
                    depotId: selectedDepot,
                    expectedDeliveryAt: expectedDate,
                    notes,
                    items: items.map(i => ({
                        productVariantId: i.variantId,
                        quantityOrdered: i.quantity,
                        unitPrice: i.unitPrice
                    }))
                }
            })

            toast.success(data.message || 'Commande créée')
            router.push(`/dashboard/procurement/${data.data.id}`)
            router.refresh()
        } catch (err) {
            toastError(err, 'Création impossible')
        } finally {
            setIsLoading(false)
        }
    }

    if (loadingData) {
        return <PageSkeleton />
    }

    if (loadError) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Nouvelle commande" description="Achat de marchandises chez un fournisseur" />
                <main className="flex-1 p-4 lg:p-6 max-w-4xl mx-auto w-full">
                    <ErrorState description={loadError} onRetry={loadData} />
                </main>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader title="Nouvelle commande" description="Achat de marchandises chez un fournisseur" />

            <main className="flex-1 p-4 lg:p-6 max-w-4xl mx-auto w-full">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/procurement">
                            <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                        </Link>
                    </Button>
                </div>

                {error && (
                    <div role="alert" className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" /> {error}
                    </div>
                )}

                <div className="space-y-6">
                    {/* STEP 1: Supplier & Depot */}
                    {step === 'supplier' && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Fournisseur & Destination</CardTitle>
                                <CardDescription>Choisissez chez qui vous commandez et où livrer</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Fournisseur</Label>
                                    {suppliers.length === 0 ? (
                                        <EmptyState
                                            title="Aucun fournisseur"
                                            description="Ajoutez d'abord un fournisseur pour pouvoir lui passer commande."
                                            action={{ label: 'Ajouter un fournisseur', href: '/dashboard/suppliers' }}
                                            className="py-8"
                                        />
                                    ) : selectedSupplier ? (
                                        <div className="flex items-center justify-between p-3 border-2 border-accent bg-accent/5 rounded-lg">
                                            <div>
                                                <p className="font-semibold">{selectedSupplier.name}</p>
                                                <p className="text-xs text-muted-foreground">{selectedSupplier.type || 'Fournisseur'}</p>
                                            </div>
                                            <Button variant="ghost" size="sm" onClick={() => setSelectedSupplier(null)}>Changer</Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    placeholder="Rechercher un fournisseur..."
                                                    aria-label="Rechercher un fournisseur"
                                                    className="pl-9"
                                                    value={supplierSearch}
                                                    onChange={e => setSupplierSearch(e.target.value)}
                                                />
                                            </div>
                                            <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                                                {filteredSuppliers.length === 0 && (
                                                    <p className="p-2 text-sm text-muted-foreground">Aucun fournisseur ne correspond à cette recherche.</p>
                                                )}
                                                {filteredSuppliers.map(s => (
                                                    <button
                                                        key={s.id}
                                                        type="button"
                                                        className="w-full text-left p-2 hover:bg-muted text-sm"
                                                        onClick={() => setSelectedSupplier(s)}
                                                    >
                                                        {s.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label>Dépôt de réception</Label>
                                    {depots.length === 0 && (
                                        <p className="text-sm text-destructive">
                                            Aucun dépôt actif.{' '}
                                            <Link href="/dashboard/depots/new" className="underline">Créer un dépôt</Link>
                                        </p>
                                    )}
                                    <Select value={selectedDepot} onValueChange={setSelectedDepot}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Sélectionner un dépôt" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {depots.map(d => (
                                                <SelectItem key={d.id} value={d.id}>{d.name} {d.is_main ? '(Principal)' : ''}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="pt-4 flex justify-end">
                                    <Button disabled={!selectedSupplier || !selectedDepot} onClick={() => setStep('products')}>
                                        Suivant <ChevronRight className="h-4 w-4 ml-2" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* STEP 2: Products */}
                    {step === 'products' && (
                        <div className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Ajouter des articles</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Rechercher un produit..."
                                            aria-label="Rechercher un produit"
                                            className="pl-9"
                                            value={productSearch}
                                            onChange={e => setProductSearch(e.target.value)}
                                        />
                                    </div>
                                    {variants.length === 0 && (
                                        <EmptyState
                                            title="Aucun produit au catalogue"
                                            description="Créez vos produits avant de passer une commande fournisseur."
                                            action={{ label: 'Gérer le catalogue', href: '/dashboard/products' }}
                                            className="py-8"
                                        />
                                    )}
                                    {productSearch && (
                                        <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                                            {filteredVariants.length === 0 && (
                                                <p className="p-2 text-sm text-muted-foreground">Aucun produit ne correspond à cette recherche.</p>
                                            )}
                                            {filteredVariants.map(v => (
                                                <button
                                                    key={v.id}
                                                    type="button"
                                                    className="w-full text-left p-2 hover:bg-muted text-sm flex justify-between"
                                                    onClick={() => addItem(v)}
                                                >
                                                    <span>{variantLabel(v.product_name, v.packaging_name, v.volume)}</span>
                                                    <Plus className="h-4 w-4 text-muted-foreground" />
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    <div className="space-y-3">
                                        {items.map(item => (
                                            <div key={item.variantId} className="flex flex-col sm:flex-row gap-3 p-3 border rounded-lg bg-muted/20">
                                                <div className="flex-1">
                                                    <p className="font-medium text-sm">{variantLabel(item.productName, item.packagingName, item.volume)}</p>
                                                </div>
                                                <div className="flex gap-2 items-center">
                                                    <div className="w-24">
                                                        <Label className="text-[10px] uppercase text-muted-foreground">Quantité</Label>
                                                        <Input
                                                            type="number"
                                                            min={1}
                                                            step={1}
                                                            aria-label={`Quantité de ${item.productName}`}
                                                            value={item.quantity}
                                                            onChange={e => updateItem(item.variantId, 'quantity', Number(e.target.value))}
                                                            className="h-8"
                                                        />
                                                    </div>
                                                    <div className="w-32">
                                                        <Label className="text-[10px] uppercase text-muted-foreground">Prix unitaire (achat)</Label>
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            aria-label={`Prix unitaire de ${item.productName}`}
                                                            value={item.unitPrice}
                                                            onChange={e => updateItem(item.variantId, 'unitPrice', Number(e.target.value))}
                                                            className="h-8"
                                                        />
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="mt-4 text-destructive"
                                                        aria-label={`Retirer ${item.productName}`}
                                                        onClick={() => removeItem(item.variantId)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {items.length === 0 && variants.length > 0 && !productSearch && (
                                        <p className="text-sm text-muted-foreground">Recherchez un produit ci-dessus pour l&apos;ajouter à la commande.</p>
                                    )}

                                    {invalidItem && (
                                        <p role="alert" className="text-sm text-destructive flex items-center gap-2">
                                            <AlertTriangle className="h-4 w-4" />
                                            {invalidItem.productName} : {INVALID_ITEM_MESSAGE}
                                        </p>
                                    )}

                                    <div className="pt-4 flex justify-between items-center">
                                        {items.length > 0 ? (
                                            <p className="font-semibold text-lg">Total estimé : {formatMoney(totalAmount)}</p>
                                        ) : <span />}
                                        <div className="flex gap-2">
                                            <Button variant="outline" onClick={() => setStep('supplier')}>Précédent</Button>
                                            <Button disabled={items.length === 0 || !!invalidItem} onClick={() => setStep('review')}>Récapitulatif</Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* STEP 3: Review */}
                    {step === 'review' && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Validation finale</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <Label className="text-muted-foreground">Fournisseur</Label>
                                        <p className="font-medium">{selectedSupplier?.name}</p>
                                    </div>
                                    <div>
                                        <Label className="text-muted-foreground">Dépôt de livraison</Label>
                                        <p className="font-medium">{depots.find(d => d.id === selectedDepot)?.name}</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="expected-date">Date de livraison prévue (optionnel)</Label>
                                        <Input id="expected-date" type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="po-notes">Notes / Commentaires</Label>
                                        <Textarea id="po-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: Livraison urgente..." />
                                    </div>
                                </div>

                                <Separator />

                                <div className="space-y-2">
                                    <Label>Articles</Label>
                                    <div className="border rounded-lg overflow-hidden">
                                        <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-muted">
                                                <tr>
                                                    <th className="text-left p-2">Article</th>
                                                    <th className="text-center p-2">Quantité</th>
                                                    <th className="text-right p-2">Unit.</th>
                                                    <th className="text-right p-2">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {items.map(item => (
                                                    <tr key={item.variantId}>
                                                        <td className="p-2">{variantLabel(item.productName, item.packagingName, item.volume)}</td>
                                                        <td className="p-2 text-center">{formatNumber(item.quantity)}</td>
                                                        <td className="p-2 text-right">{formatMoney(item.unitPrice)}</td>
                                                        <td className="p-2 text-right font-medium">{formatMoney(item.quantity * item.unitPrice)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-muted/50 font-bold">
                                                <tr>
                                                    <td colSpan={3} className="p-2 text-right">TOTAL</td>
                                                    <td className="p-2 text-right">{formatMoney(totalAmount)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-between pt-4">
                                    <Button variant="outline" disabled={isLoading} onClick={() => setStep('products')}>Retour</Button>
                                    <Button disabled={isLoading || !!invalidItem} onClick={handleSubmit}>
                                        {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                        Confirmer la commande
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </main>
        </div>
    )
}
