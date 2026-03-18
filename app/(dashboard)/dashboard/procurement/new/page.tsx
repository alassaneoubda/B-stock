'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
    Loader2,
    ArrowLeft,
    Search,
    Plus,
    Trash2,
    ArchiveRestore,
    Package,
    ChevronRight,
    AlertTriangle,
    Building2,
} from 'lucide-react'
import Link from 'next/link'

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
    volume: string | null
    quantity: number
    unitPrice: number
}

type Step = 'supplier' | 'products' | 'review'

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
    const [loadingData, setLoadingData] = useState(false)

    useEffect(() => {
        setLoadingData(true)
        Promise.all([
            fetch('/api/suppliers').then(r => r.json()),
            fetch('/api/depots').then(r => r.json()),
            fetch('/api/products?includeVariants=true').then(r => r.json())
        ]).then(([sData, dData, pData]) => {
            setSuppliers(sData.suppliers || [])
            setDepots(dData.depots || [])
            if (dData.depots?.length > 0) {
                const main = dData.depots.find((d: Depot) => d.is_main)
                setSelectedDepot(main ? main.id : dData.depots[0].id)
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
        }).finally(() => setLoadingData(false))
    }, [])

    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(supplierSearch.toLowerCase())
    )

    const filteredVariants = variants.filter(v =>
        v.product_name.toLowerCase().includes(productSearch.toLowerCase())
    )

    function addItem(variant: ProductVariant) {
        if (items.find(i => i.variantId === variant.id)) return
        setItems([...items, {
            variantId: variant.id,
            productName: variant.product_name,
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
        if (!selectedSupplier || !selectedDepot || items.length === 0) return
        setIsLoading(true)
        setError(null)

        try {
            const res = await fetch('/api/procurement', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplierId: selectedSupplier.id,
                    depotId: selectedDepot,
                    expectedDeliveryAt: expectedDate,
                    notes,
                    items: items.map(i => ({
                        productVariantId: i.variantId,
                        quantityOrdered: i.quantity,
                        unitPrice: i.unitPrice
                    }))
                })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erreur lors de la création')

            router.push(`/dashboard/procurement/${data.data.id}`)
            router.refresh()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
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
                    <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive flex items-center gap-2">
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
                                    {selectedSupplier ? (
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
                                                    className="pl-9"
                                                    value={supplierSearch}
                                                    onChange={e => setSupplierSearch(e.target.value)}
                                                />
                                            </div>
                                            <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                                                {filteredSuppliers.map(s => (
                                                    <button
                                                        key={s.id}
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
                                            className="pl-9"
                                            value={productSearch}
                                            onChange={e => setProductSearch(e.target.value)}
                                        />
                                    </div>
                                    {productSearch && (
                                        <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                                            {filteredVariants.map(v => (
                                                <button
                                                    key={v.id}
                                                    className="w-full text-left p-2 hover:bg-muted text-sm flex justify-between"
                                                    onClick={() => addItem(v)}
                                                >
                                                    <span>{v.product_name} {v.volume ? `(${v.volume})` : ''}</span>
                                                    <Plus className="h-4 w-4 text-muted-foreground" />
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    <div className="space-y-3">
                                        {items.map(item => (
                                            <div key={item.variantId} className="flex flex-col sm:flex-row gap-3 p-3 border rounded-lg bg-muted/20">
                                                <div className="flex-1">
                                                    <p className="font-medium text-sm">{item.productName} {item.volume ? `(${item.volume})` : ''}</p>
                                                </div>
                                                <div className="flex gap-2 items-center">
                                                    <div className="w-24">
                                                        <Label className="text-[10px] uppercase text-muted-foreground">Quantité</Label>
                                                        <Input
                                                            type="number"
                                                            value={item.quantity}
                                                            onChange={e => updateItem(item.variantId, 'quantity', Number(e.target.value))}
                                                            className="h-8"
                                                        />
                                                    </div>
                                                    <div className="w-32">
                                                        <Label className="text-[10px] uppercase text-muted-foreground">Prix unitaire (achat)</Label>
                                                        <Input
                                                            type="number"
                                                            value={item.unitPrice}
                                                            onChange={e => updateItem(item.variantId, 'unitPrice', Number(e.target.value))}
                                                            className="h-8"
                                                        />
                                                    </div>
                                                    <Button variant="ghost" size="icon" className="mt-4 text-destructive" onClick={() => removeItem(item.variantId)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {items.length > 0 && (
                                        <div className="pt-4 flex justify-between items-center">
                                            <p className="font-semibold text-lg">Total estimé: {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(totalAmount)}</p>
                                            <div className="flex gap-2">
                                                <Button variant="outline" onClick={() => setStep('supplier')}>Précédent</Button>
                                                <Button onClick={() => setStep('review')}>Récapitulatif</Button>
                                            </div>
                                        </div>
                                    )}
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
                                        <Label>Date de livraison prévue (optionnel)</Label>
                                        <Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Notes / Commentaires</Label>
                                        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: Livraison urgente..." />
                                    </div>
                                </div>

                                <Separator />

                                <div className="space-y-2">
                                    <Label>Articles</Label>
                                    <div className="border rounded-lg overflow-hidden">
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
                                                        <td className="p-2">{item.productName}</td>
                                                        <td className="p-2 text-center">{item.quantity}</td>
                                                        <td className="p-2 text-right">{new Intl.NumberFormat('fr-FR').format(item.unitPrice)}</td>
                                                        <td className="p-2 text-right font-medium">{new Intl.NumberFormat('fr-FR').format(item.quantity * item.unitPrice)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-muted/50 font-bold">
                                                <tr>
                                                    <td colSpan={3} className="p-2 text-right">TOTAL</td>
                                                    <td className="p-2 text-right">{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(totalAmount)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>

                                <div className="flex justify-between pt-4">
                                    <Button variant="outline" onClick={() => setStep('products')}>Retour</Button>
                                    <Button disabled={isLoading} onClick={handleSubmit}>
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
