'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageShell } from '@/components/app/blocks'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    Loader2,
    ArrowLeft,
    Search,
    Plus,
    Trash2,
    ChevronRight,
    AlertTriangle,
    Check,
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

    const steps: { key: Step; label: string }[] = [
        { key: 'supplier', label: 'Fournisseur' },
        { key: 'products', label: 'Articles' },
        { key: 'review', label: 'Validation' },
    ]
    const currentIndex = steps.findIndex(s => s.key === step)

    if (loadingData) {
        return <PageSkeleton />
    }

    if (loadError) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Nouvelle commande" description="Achat de marchandises chez un fournisseur" />
                <PageShell className="max-w-3xl">
                    <ErrorState description={loadError} onRetry={loadData} />
                </PageShell>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader title="Nouvelle commande" description="Achat de marchandises chez un fournisseur" />

            <PageShell className="max-w-3xl">
                <div className="space-y-4">
                    <Button variant="ghost" size="sm" asChild className="-ml-2">
                        <Link href="/dashboard/procurement">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Approvisionnement
                        </Link>
                    </Button>

                    {/* Étapes */}
                    <ol className="flex items-center gap-2 text-sm" aria-label="Étapes de la commande">
                        {steps.map((s, i) => {
                            const done = i < currentIndex
                            const active = i === currentIndex
                            return (
                                <li key={s.key} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
                                    <span
                                        className={cn(
                                            'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium tabular transition-colors',
                                            active && 'bg-primary text-primary-foreground',
                                            done && 'bg-success-soft text-success',
                                            !active && !done && 'bg-muted text-muted-foreground'
                                        )}
                                    >
                                        {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
                                    </span>
                                    <span className={cn(active ? 'font-medium text-foreground' : 'text-muted-foreground')}>{s.label}</span>
                                    {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                                </li>
                            )
                        })}
                    </ol>
                </div>

                {error && (
                    <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> {error}
                    </div>
                )}

                {/* ÉTAPE 1 : fournisseur et dépôt */}
                {step === 'supplier' && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Fournisseur et destination</CardTitle>
                            <CardDescription>Choisissez chez qui vous commandez et où livrer.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
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
                                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-foreground">{selectedSupplier.name}</p>
                                            <p className="text-xs text-muted-foreground">{selectedSupplier.type || 'Fournisseur'}</p>
                                        </div>
                                        <Button variant="outline" size="sm" onClick={() => setSelectedSupplier(null)}>Changer</Button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                            <Input
                                                placeholder="Rechercher un fournisseur…"
                                                aria-label="Rechercher un fournisseur"
                                                className="h-10 pl-9"
                                                value={supplierSearch}
                                                onChange={e => setSupplierSearch(e.target.value)}
                                            />
                                        </div>
                                        <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                                            {filteredSuppliers.length === 0 && (
                                                <p className="px-3 py-2.5 text-sm text-muted-foreground">Aucun fournisseur ne correspond à cette recherche.</p>
                                            )}
                                            {filteredSuppliers.map(s => (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                                                    onClick={() => setSelectedSupplier(s)}
                                                >
                                                    <span className="truncate">{s.name}</span>
                                                    {s.type && <span className="ml-3 shrink-0 text-xs text-muted-foreground">{s.type}</span>}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="po-depot">Dépôt de réception</Label>
                                {depots.length === 0 && (
                                    <p className="text-sm text-destructive">
                                        Aucun dépôt actif.{' '}
                                        <Link href="/dashboard/depots/new" className="underline underline-offset-2">Créer un dépôt</Link>
                                    </p>
                                )}
                                <Select value={selectedDepot} onValueChange={setSelectedDepot}>
                                    <SelectTrigger id="po-depot" className="w-full">
                                        <SelectValue placeholder="Sélectionner un dépôt" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {depots.map(d => (
                                            <SelectItem key={d.id} value={d.id}>{d.name} {d.is_main ? '(principal)' : ''}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">Le stock sera ajouté à ce dépôt lors de la réception.</p>
                            </div>
                        </CardContent>
                        <CardFooter className="justify-end gap-2 border-t">
                            <Button variant="outline" asChild>
                                <Link href="/dashboard/procurement">Annuler</Link>
                            </Button>
                            <Button disabled={!selectedSupplier || !selectedDepot} onClick={() => setStep('products')}>
                                Suivant <ChevronRight className="h-4 w-4" aria-hidden="true" />
                            </Button>
                        </CardFooter>
                    </Card>
                )}

                {/* ÉTAPE 2 : articles */}
                {step === 'products' && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Articles</CardTitle>
                            <CardDescription>Recherchez les produits à commander puis ajustez quantités et prix d&apos;achat.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                    <Input
                                        placeholder="Rechercher un produit…"
                                        aria-label="Rechercher un produit"
                                        className="h-10 pl-9"
                                        value={productSearch}
                                        onChange={e => setProductSearch(e.target.value)}
                                    />
                                </div>
                                {productSearch && (
                                    <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                                        {filteredVariants.length === 0 && (
                                            <p className="px-3 py-2.5 text-sm text-muted-foreground">Aucun produit ne correspond à cette recherche.</p>
                                        )}
                                        {filteredVariants.map(v => (
                                            <button
                                                key={v.id}
                                                type="button"
                                                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                                                onClick={() => addItem(v)}
                                            >
                                                <span className="truncate">{variantLabel(v.product_name, v.packaging_name, v.volume)}</span>
                                                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {variants.length === 0 && (
                                <EmptyState
                                    title="Aucun produit au catalogue"
                                    description="Créez vos produits avant de passer une commande fournisseur."
                                    action={{ label: 'Gérer le catalogue', href: '/dashboard/products' }}
                                    className="py-8"
                                />
                            )}

                            {items.length > 0 && (
                                <ul className="divide-y divide-border rounded-lg border border-border">
                                    {items.map(item => (
                                        <li key={item.variantId} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
                                            <div className="min-w-0 flex-1 sm:pb-2">
                                                <p className="truncate text-sm font-medium text-foreground">
                                                    {variantLabel(item.productName, item.packagingName, item.volume)}
                                                </p>
                                                <p className="tabular text-xs text-muted-foreground">
                                                    Sous-total : {formatMoney(item.quantity * item.unitPrice)}
                                                </p>
                                            </div>
                                            <div className="flex items-end gap-2">
                                                <div className="w-24 space-y-1">
                                                    <Label htmlFor={`qty-${item.variantId}`} className="text-xs text-muted-foreground">Quantité</Label>
                                                    <Input
                                                        id={`qty-${item.variantId}`}
                                                        type="number"
                                                        min={1}
                                                        step={1}
                                                        aria-label={`Quantité de ${item.productName}`}
                                                        value={item.quantity}
                                                        onChange={e => updateItem(item.variantId, 'quantity', Number(e.target.value))}
                                                        className="tabular h-9 text-right"
                                                    />
                                                </div>
                                                <div className="w-36 space-y-1">
                                                    <Label htmlFor={`price-${item.variantId}`} className="text-xs text-muted-foreground">Prix d&apos;achat unitaire</Label>
                                                    <Input
                                                        id={`price-${item.variantId}`}
                                                        type="number"
                                                        min={0}
                                                        aria-label={`Prix unitaire de ${item.productName}`}
                                                        value={item.unitPrice}
                                                        onChange={e => updateItem(item.variantId, 'unitPrice', Number(e.target.value))}
                                                        className="tabular h-9 text-right"
                                                    />
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-muted-foreground hover:text-destructive"
                                                    aria-label={`Retirer ${item.productName}`}
                                                    onClick={() => removeItem(item.variantId)}
                                                >
                                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                </Button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {items.length === 0 && variants.length > 0 && !productSearch && (
                                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                                    Recherchez un produit ci-dessus pour l&apos;ajouter à la commande.
                                </p>
                            )}

                            {invalidItem && (
                                <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    {invalidItem.productName} : {INVALID_ITEM_MESSAGE}
                                </p>
                            )}
                        </CardContent>
                        <CardFooter className="flex-wrap justify-between gap-3 border-t">
                            {items.length > 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Total estimé <span className="tabular ml-1 text-base font-semibold text-foreground">{formatMoney(totalAmount)}</span>
                                </p>
                            ) : <span />}
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setStep('supplier')}>Précédent</Button>
                                <Button disabled={items.length === 0 || !!invalidItem} onClick={() => setStep('review')}>
                                    Récapitulatif <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                </Button>
                            </div>
                        </CardFooter>
                    </Card>
                )}

                {/* ÉTAPE 3 : validation */}
                {step === 'review' && (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle>Livraison</CardTitle>
                                <CardDescription>Vérifiez la destination et ajoutez les informations utiles.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-4 rounded-lg bg-muted/40 p-4 text-sm md:grid-cols-2">
                                    <div className="space-y-0.5">
                                        <p className="text-xs text-muted-foreground">Fournisseur</p>
                                        <p className="font-medium text-foreground">{selectedSupplier?.name}</p>
                                    </div>
                                    <div className="space-y-0.5">
                                        <p className="text-xs text-muted-foreground">Dépôt de livraison</p>
                                        <p className="font-medium text-foreground">{depots.find(d => d.id === selectedDepot)?.name}</p>
                                    </div>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="expected-date">Date de livraison prévue</Label>
                                        <Input id="expected-date" type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
                                        <p className="text-xs text-muted-foreground">Facultatif.</p>
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <Label htmlFor="po-notes">Notes et commentaires</Label>
                                        <Textarea id="po-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex. : livraison urgente…" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="gap-0 overflow-hidden py-0">
                            <CardHeader className="border-b pt-5">
                                <CardTitle>Articles</CardTitle>
                                <CardDescription>
                                    {formatNumber(items.length)} article{items.length > 1 ? 's' : ''} dans la commande
                                </CardDescription>
                            </CardHeader>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="pl-5">Article</TableHead>
                                            <TableHead className="text-right">Quantité</TableHead>
                                            <TableHead className="text-right">Prix unit.</TableHead>
                                            <TableHead className="pr-5 text-right">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {items.map(item => (
                                            <TableRow key={item.variantId}>
                                                <TableCell className="pl-5 text-foreground">{variantLabel(item.productName, item.packagingName, item.volume)}</TableCell>
                                                <TableCell className="tabular text-right">{formatNumber(item.quantity)}</TableCell>
                                                <TableCell className="tabular text-right text-muted-foreground">{formatMoney(item.unitPrice)}</TableCell>
                                                <TableCell className="tabular pr-5 text-right font-medium text-foreground">{formatMoney(item.quantity * item.unitPrice)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                    <TableFooter>
                                        <TableRow className="hover:bg-transparent">
                                            <TableCell colSpan={3} className="pl-5 text-right font-medium text-foreground">Total</TableCell>
                                            <TableCell className="tabular pr-5 text-right text-base font-semibold text-foreground">{formatMoney(totalAmount)}</TableCell>
                                        </TableRow>
                                    </TableFooter>
                                </Table>
                            </div>
                        </Card>

                        <div className="flex flex-wrap justify-end gap-2">
                            <Button variant="outline" disabled={isLoading} onClick={() => setStep('products')}>Précédent</Button>
                            <Button variant="brand" disabled={isLoading || !!invalidItem} onClick={handleSubmit}>
                                {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                Confirmer la commande
                            </Button>
                        </div>
                    </>
                )}
            </PageShell>
        </div>
    )
}
