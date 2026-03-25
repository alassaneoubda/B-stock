'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
    ShoppingCart,
    Package,
    CreditCard,
    Banknote,
    Smartphone,
    ChevronRight,
    AlertTriangle,
    BoxesIcon,
} from 'lucide-react'
import Link from 'next/link'

interface Client {
    id: string
    name: string
    phone: string | null
    client_type: string
    credit_limit: number
    packaging_credit_limit: number
    product_balance: number
    packaging_balance: number
    zone: string | null
}

interface ProductVariant {
    id: string
    product_id: string
    product_name: string
    volume: string | null
    unit_type: string
    selling_price: number
    available_stock: number
    depot_id: string
}

interface PackagingType {
    id: string
    name: string
    deposit_price: number
    is_returnable: boolean
}

interface OrderItem {
    variantId: string
    productName: string
    volume: string | null
    quantity: number
    unitPrice: number
    depotId: string
    availableStock: number
}

interface PackagingItem {
    packagingTypeId: string
    name: string
    depositPrice: number
    quantityOut: number
    quantityIn: number
}

type Step = 'client' | 'products' | 'packaging' | 'payment'

const STEPS: { id: Step; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'client', label: 'Client', icon: ShoppingCart },
    { id: 'products', label: 'Produits', icon: Package },
    { id: 'packaging', label: 'Emballages', icon: BoxesIcon },
    { id: 'payment', label: 'Paiement', icon: CreditCard },
]

function formatCurrency(n: number) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(n)
}

export default function NewSalePage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const preloadClientId = searchParams.get('client')

    const [step, setStep] = useState<Step>('client')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Step 1: Client & Depot
    const [clientSearch, setClientSearch] = useState('')
    const [clients, setClients] = useState<Client[]>([])
    const [selectedClient, setSelectedClient] = useState<Client | null>(null)
    const [loadingClients, setLoadingClients] = useState(false)
    const [depots, setDepots] = useState<any[]>([])
    const [selectedDepotId, setSelectedDepotId] = useState<string>('')
    const [loadingDepots, setLoadingDepots] = useState(false)

    // Step 2: Products
    const [variants, setVariants] = useState<ProductVariant[]>([])
    const [orderItems, setOrderItems] = useState<OrderItem[]>([])
    const [productSearch, setProductSearch] = useState('')
    const [loadingProducts, setLoadingProducts] = useState(false)

    // Step 3: Packaging
    const [packagingTypes, setPackagingTypes] = useState<PackagingType[]>([])
    const [packagingItems, setPackagingItems] = useState<PackagingItem[]>([])

    // Step 4: Payment
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mobile_money' | 'credit' | 'mixed'>('cash')
    const [paidAmount, setPaidAmount] = useState(0)
    const [orderSource, setOrderSource] = useState<'in_person' | 'phone' | 'whatsapp' | 'other'>('in_person')
    const [notes, setNotes] = useState('')

    useEffect(() => {
        if (preloadClientId) {
            fetch(`/api/clients/${preloadClientId}`)
                .then(r => r.json())
                .then(d => {
                    if (d.data) setSelectedClient(d.data)
                })
                .catch(() => { })
        }

        // Charger les dépôts
        setLoadingDepots(true)
        fetch('/api/depots')
            .then(r => r.json())
            .then(d => {
                const list = d.data || d.depots || []
                setDepots(list)
                const main = list.find((dp: any) => dp.is_main)
                if (main) setSelectedDepotId(main.id)
                else if (list.length > 0) setSelectedDepotId(list[0].id)
            })
            .catch(() => { })
            .finally(() => setLoadingDepots(false))
    }, [preloadClientId])

    // Rechercher des clients
    useEffect(() => {
        if (!clientSearch.trim()) {
            setClients([])
            return
        }
        const timeout = setTimeout(async () => {
            setLoadingClients(true)
            try {
                const r = await fetch(`/api/clients?search=${encodeURIComponent(clientSearch)}`)
                const d = await r.json()
                setClients(d.data || d.clients || [])
            } finally {
                setLoadingClients(false)
            }
        }, 300)
        return () => clearTimeout(timeout)
    }, [clientSearch])

    // Charger les produits disponibles avec leur stock
    useEffect(() => {
        if (step === 'products') {
            setLoadingProducts(true)
            fetch('/api/stock')
                .then(r => r.json())
                .then(d => {
                    const stockData = d.data || []
                    // Consolider les stocks par variant_id
                    
                    const consolidated: Record<string, ProductVariant> = {}

                    stockData.forEach((s: any) => {
                        if (!consolidated[s.variant_id]) {
                            consolidated[s.variant_id] = {
                                id: s.variant_id,
                                product_id: s.product_id,
                                product_name: s.product_name,
                                volume: s.packaging_name, // Utiliser le nom de l'emballage comme volume/description
                                unit_type: 'unit',
                                selling_price: Number(s.price),
                                available_stock: Number(s.quantity),
                                depot_id: s.depot_id
                            }
                        } else {
                            consolidated[s.variant_id].available_stock += Number(s.quantity)
                        }
                    })

                    setVariants(Object.values(consolidated))
                })
                .catch(() => { })
                .finally(() => setLoadingProducts(false))
        }
    }, [step])

    // Charger les emballages
    useEffect(() => {
        if (step === 'packaging') {
            fetch('/api/packaging')
                .then(r => r.json())
                .then(d => {
                    const types: PackagingType[] = d.data || d.packagingTypes || []
                    setPackagingTypes(types)
                    if (packagingItems.length === 0 && types.length > 0) {
                        setPackagingItems(types.map(pt => ({
                            packagingTypeId: pt.id,
                            name: pt.name,
                            depositPrice: Number(pt.deposit_price || 0),
                            quantityOut: 0,
                            quantityIn: 0,
                        })))
                    }
                })
                .catch(() => { })
        }
    }, [step])

    const totalProducts = orderItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const totalPackagingOut = packagingItems.reduce((s, i) => s + i.quantityOut * i.depositPrice, 0)
    const totalPackagingIn = packagingItems.reduce((s, i) => s + i.quantityIn * i.depositPrice, 0)
    const totalPackaging = totalPackagingOut - totalPackagingIn
    const totalAmount = totalProducts + totalPackaging
    const remainingToPay = totalAmount - paidAmount

    function addItem(variant: ProductVariant) {
        setOrderItems(prev => {
            const existing = prev.find(i => i.variantId === variant.id)
            if (existing) {
                return prev.map(i => i.variantId === variant.id
                    ? { ...i, quantity: Math.min(i.quantity + 1, variant.available_stock) }
                    : i
                )
            }
            return [...prev, {
                variantId: variant.id,
                productName: variant.product_name,
                volume: variant.volume,
                quantity: 1,
                unitPrice: variant.selling_price,
                depotId: variant.depot_id,
                availableStock: variant.available_stock,
            }]
        })
    }

    function removeItem(variantId: string) {
        setOrderItems(prev => prev.filter(i => i.variantId !== variantId))
    }

    function updateQuantity(variantId: string, qty: number) {
        setOrderItems(prev => prev.map(i =>
            i.variantId === variantId ? { ...i, quantity: Math.min(Math.max(1, qty), i.availableStock) } : i
        ))
    }

    const filteredVariants = variants.filter(v =>
        !productSearch || v.product_name.toLowerCase().includes(productSearch.toLowerCase())
    )

    async function handleSubmit() {
        if (!selectedClient) return
        setIsLoading(true)
        setError(null)

        try {
            const response = await fetch('/api/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: selectedClient.id,
                    depotId: selectedDepotId,
                    orderSource,
                    paymentMethod,
                    paidAmount: paymentMethod === 'credit' ? 0 : paidAmount,
                    notes,
                    items: orderItems.map(i => ({
                        productVariantId: i.variantId,
                        quantity: i.quantity,
                        unitPrice: i.unitPrice,
                    })),
                    packagingItems: packagingItems
                        .filter(p => p.quantityOut > 0 || p.quantityIn > 0)
                        .map(p => ({
                            packagingTypeId: p.packagingTypeId,
                            quantityOut: p.quantityOut,
                            quantityIn: p.quantityIn,
                            unitPrice: p.depositPrice,
                        })),
                }),
            })

            const result = await response.json()
            if (!response.ok) {
                setError(result.error || 'Erreur lors de la création')
                return
            }

            router.push(`/dashboard/sales/${result.data.id}`)
            router.refresh()
        } catch {
            setError('Erreur réseau. Veuillez réessayer.')
        } finally {
            setIsLoading(false)
        }
    }

    const steps: Step[] = ['client', 'products', 'packaging', 'payment']
    const currentStepIndex = steps.indexOf(step)

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader
                title="Nouvelle vente"
                description="Enregistrez une commande client"
            />

            <main className="flex-1 p-4 lg:p-6">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/sales">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Retour aux ventes
                        </Link>
                    </Button>
                </div>

                {/* Stepper */}
                <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
                    {STEPS.map((s, i) => {
                        const Icon = s.icon
                        const isDone = steps.indexOf(s.id) < currentStepIndex
                        const isActive = s.id === step
                        return (
                            <div key={s.id} className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => {
                                        if (isDone) setStep(s.id)
                                    }}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
                                        ? 'bg-accent text-accent-foreground'
                                        : isDone
                                            ? 'text-accent hover:bg-accent/10 cursor-pointer'
                                            : 'text-muted-foreground cursor-not-allowed'
                                        }`}
                                >
                                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${isActive ? 'bg-accent-foreground text-accent' : isDone ? 'bg-accent/20 text-accent' : 'bg-muted text-muted-foreground'
                                        }`}>
                                        {isDone ? '✓' : i + 1}
                                    </div>
                                    {s.label}
                                </button>
                                {i < STEPS.length - 1 && (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                )}
                            </div>
                        )
                    })}
                </div>

                {error && (
                    <div className="mb-6 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {error}
                    </div>
                )}

                <div className="max-w-3xl space-y-6">
                    {/* ÉTAPE 1 : CLIENT */}
                    {step === 'client' && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Sélectionner le client</CardTitle>
                                <CardDescription>Recherchez par nom ou numéro de téléphone</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {selectedClient ? (
                                    <div className="flex items-start justify-between p-4 rounded-lg border-2 border-accent bg-accent/5">
                                        <div>
                                            <h3 className="font-semibold text-foreground">{selectedClient.name}</h3>
                                            {selectedClient.phone && <p className="text-sm text-muted-foreground">{selectedClient.phone}</p>}
                                            {selectedClient.zone && <p className="text-xs text-muted-foreground">{selectedClient.zone}</p>}
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className="text-xs">Produits:</span>
                                                <span className={`text-xs font-medium ${Number(selectedClient.product_balance) < 0 ? 'text-destructive' : 'text-success'}`}>
                                                    {formatCurrency(Number(selectedClient.product_balance))}
                                                </span>
                                                <span className="text-xs ml-2">Emballages:</span>
                                                <span className={`text-xs font-medium ${Number(selectedClient.packaging_balance) < 0 ? 'text-warning-foreground' : 'text-success'}`}>
                                                    {formatCurrency(Number(selectedClient.packaging_balance))}
                                                </span>
                                            </div>
                                        </div>
                                        <Button variant="outline" size="sm" onClick={() => setSelectedClient(null)}>
                                            Changer
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                placeholder="Rechercher un client..."
                                                className="pl-9"
                                                value={clientSearch}
                                                onChange={e => setClientSearch(e.target.value)}
                                            />
                                        </div>
                                        {loadingClients && <p className="text-sm text-muted-foreground">Recherche...</p>}
                                        {clients.length > 0 && (
                                            <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                                                {clients.map(c => (
                                                    <button
                                                        key={c.id}
                                                        className="w-full flex items-start justify-between p-3 hover:bg-muted/50 text-left transition-colors"
                                                        onClick={() => { setSelectedClient(c); setClientSearch('') }}
                                                    >
                                                        <div>
                                                            <p className="font-medium text-sm">{c.name}</p>
                                                            {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                                                        </div>
                                                        <Badge variant="outline" className="text-xs shrink-0">
                                                            {c.zone || 'Sans zone'}
                                                        </Badge>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {clientSearch && !loadingClients && clients.length === 0 && (
                                            <p className="text-sm text-muted-foreground text-center py-4">
                                                Aucun client trouvé.
                                                <Link href="/dashboard/clients/new" className="text-accent ml-1 hover:underline">
                                                    Créer ce client
                                                </Link>
                                            </p>
                                        )}
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label>Source de la commande</Label>
                                    <Select value={orderSource} onValueChange={v => setOrderSource(v as typeof orderSource)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="in_person">En personne</SelectItem>
                                            <SelectItem value="phone">Par téléphone</SelectItem>
                                            <SelectItem value="whatsapp">Via WhatsApp</SelectItem>
                                            <SelectItem value="other">Autre</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Dépôt de départ</Label>
                                    <Select value={selectedDepotId} onValueChange={setSelectedDepotId} disabled={loadingDepots}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Sélectionner un dépôt" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {depots.map(d => (
                                                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* ÉTAPE 2 : PRODUITS */}
                    {step === 'products' && (
                        <div className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Ajouter des produits</CardTitle>
                                    <CardDescription>Sélectionnez les produits et quantités</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            placeholder="Rechercher un produit..."
                                            className="pl-9"
                                            value={productSearch}
                                            onChange={e => setProductSearch(e.target.value)}
                                        />
                                    </div>

                                    {loadingProducts ? (
                                        <div className="text-center py-8">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                        </div>
                                    ) : (
                                        <div className="grid gap-2 max-h-64 overflow-y-auto">
                                            {filteredVariants.map(v => {
                                                const inOrder = orderItems.find(i => i.variantId === v.id)
                                                return (
                                                    <div key={v.id} className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${inOrder ? 'border-accent bg-accent/5' : 'hover:bg-muted/50'
                                                        }`}>
                                                        <div>
                                                            <p className="font-medium text-sm">{v.product_name} {v.volume && `(${v.volume})`}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {formatCurrency(v.selling_price)} — Stock: {v.available_stock}
                                                            </p>
                                                        </div>
                                                        <Button size="sm" variant={inOrder ? 'default' : 'outline'} onClick={() => addItem(v)}>
                                                            <Plus className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {orderItems.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">Articles sélectionnés ({orderItems.length})</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {orderItems.map(item => (
                                            <div key={item.variantId} className="flex items-center gap-3">
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium">{item.productName} {item.volume && `(${item.volume})`}</p>
                                                    <p className="text-xs text-muted-foreground">{formatCurrency(item.unitPrice)} / unité</p>
                                                </div>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    max={item.availableStock}
                                                    value={item.quantity}
                                                    onChange={e => updateQuantity(item.variantId, Number(e.target.value))}
                                                    className="w-20 text-center"
                                                />
                                                <p className="text-sm font-medium w-24 text-right">
                                                    {formatCurrency(item.quantity * item.unitPrice)}
                                                </p>
                                                <Button size="icon" variant="ghost" onClick={() => removeItem(item.variantId)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        ))}
                                        <Separator />
                                        <div className="flex justify-between font-semibold">
                                            <span>Total produits</span>
                                            <span>{formatCurrency(totalProducts)}</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    )}

                    {/* ÉTAPE 3 : EMBALLAGES */}
                    {step === 'packaging' && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Emballages</CardTitle>
                                <CardDescription>
                                    Saisissez les casiers sortis (livrés) et retournés par le client
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {packagingItems.length === 0 ? (
                                    <p className="text-center text-muted-foreground py-6 text-sm">
                                        Aucun type d&apos;emballage configuré.
                                        <Link href="/dashboard/packaging/new" className="text-accent ml-1 hover:underline">
                                            Configurer les emballages
                                        </Link>
                                    </p>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                                            <span className="col-span-5">Emballage</span>
                                            <span className="col-span-3 text-center">Sortis (+)</span>
                                            <span className="col-span-3 text-center">Retournés (-)</span>
                                            <span className="col-span-1"></span>
                                        </div>
                                        {packagingItems.map((pkg, idx) => (
                                            <div key={pkg.packagingTypeId} className={`grid grid-cols-12 gap-2 items-center p-2 rounded-lg ${(pkg.quantityOut > 0 || pkg.quantityIn > 0) ? 'bg-accent/5 border border-accent/20' : 'hover:bg-muted/30'
                                                }`}>
                                                <div className="col-span-5">
                                                    <p className="text-sm font-medium">{pkg.name}</p>
                                                    <p className="text-xs text-muted-foreground">{formatCurrency(pkg.depositPrice)} / casier</p>
                                                </div>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    value={pkg.quantityOut}
                                                    onChange={e => {
                                                        const val = Math.max(0, Number(e.target.value))
                                                        setPackagingItems(prev => prev.map((p, i) => i === idx ? { ...p, quantityOut: val } : p))
                                                    }}
                                                    className="col-span-3 text-center h-8"
                                                />
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    value={pkg.quantityIn}
                                                    onChange={e => {
                                                        const val = Math.max(0, Number(e.target.value))
                                                        setPackagingItems(prev => prev.map((p, i) => i === idx ? { ...p, quantityIn: val } : p))
                                                    }}
                                                    className="col-span-3 text-center h-8"
                                                />
                                            </div>
                                        ))}
                                        {totalPackaging !== 0 && (
                                            <>
                                                <Separator />
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-muted-foreground">Emballages sortis</span>
                                                    <span>+{formatCurrency(totalPackagingOut)}</span>
                                                </div>
                                                {totalPackagingIn > 0 && (
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-muted-foreground">Emballages retournés</span>
                                                        <span className="text-success">-{formatCurrency(totalPackagingIn)}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between font-semibold">
                                                    <span>Net emballages</span>
                                                    <span>{formatCurrency(totalPackaging)}</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* ÉTAPE 4 : PAIEMENT */}
                    {step === 'payment' && (
                        <div className="space-y-4">
                            {/* Récapitulatif */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Récapitulatif de la commande</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Client</span>
                                        <span className="font-medium">{selectedClient?.name}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Produits ({orderItems.length} articles)</span>
                                        <span>{formatCurrency(totalProducts)}</span>
                                    </div>
                                    {totalPackaging !== 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Emballages (net)</span>
                                            <span>{formatCurrency(totalPackaging)}</span>
                                        </div>
                                    )}
                                    <Separator />
                                    <div className="flex justify-between font-bold text-lg">
                                        <span>Total à payer</span>
                                        <span>{formatCurrency(totalAmount)}</span>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Mode de paiement</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { value: 'cash', label: 'Espèces', icon: Banknote },
                                            { value: 'mobile_money', label: 'Mobile Money', icon: Smartphone },
                                            { value: 'credit', label: 'Crédit', icon: CreditCard },
                                            { value: 'mixed', label: 'Mixte', icon: CreditCard },
                                        ].map(({ value, label, icon: Icon }) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => {
                                                    setPaymentMethod(value as typeof paymentMethod)
                                                    if (value === 'cash' || value === 'mobile_money') setPaidAmount(totalAmount)
                                                }}
                                                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${paymentMethod === value
                                                    ? 'border-accent bg-accent/10 text-accent'
                                                    : 'border-border hover:border-accent/50'
                                                    }`}
                                            >
                                                <Icon className="h-5 w-5" />
                                                <span className="text-sm font-medium">{label}</span>
                                            </button>
                                        ))}
                                    </div>

                                    {paymentMethod !== 'credit' && (
                                        <div className="space-y-2">
                                            <Label htmlFor="paidAmount">Montant encaissé (FCFA)</Label>
                                            <Input
                                                id="paidAmount"
                                                type="number"
                                                min="0"
                                                max={totalAmount}
                                                value={paidAmount}
                                                onChange={e => setPaidAmount(Number(e.target.value))}
                                            />
                                            {remainingToPay > 0 && paymentMethod === 'mixed' && (
                                                <p className="text-sm text-warning-foreground">
                                                    Reste en crédit : {formatCurrency(remainingToPay)}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Payment allocation preview */}
                                    {(() => {
                                        const effectivePaid = paymentMethod === 'credit' ? 0 : paidAmount
                                        const allocProducts = Math.min(totalProducts, effectivePaid)
                                        const allocPackaging = Math.min(totalPackaging, Math.max(0, effectivePaid - totalProducts))
                                        const debtProducts = totalProducts - allocProducts
                                        const debtPackaging = totalPackaging - allocPackaging
                                        return (debtProducts > 0 || debtPackaging > 0) ? (
                                            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
                                                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Répartition du paiement</p>
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Payé produits</span>
                                                        <span className="font-bold">{formatCurrency(allocProducts)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Payé emballages</span>
                                                        <span className="font-bold">{formatCurrency(allocPackaging)}</span>
                                                    </div>
                                                </div>
                                                <Separator />
                                                <p className="text-xs font-bold text-rose-600 uppercase tracking-wider">Dettes créées</p>
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    {debtProducts > 0 && (
                                                        <div className="flex justify-between">
                                                            <span className="text-muted-foreground">Dette produits</span>
                                                            <span className="font-bold text-rose-600">{formatCurrency(debtProducts)}</span>
                                                        </div>
                                                    )}
                                                    {debtPackaging > 0 && (
                                                        <div className="flex justify-between">
                                                            <span className="text-muted-foreground">Dette emballages</span>
                                                            <span className="font-bold text-amber-600">{formatCurrency(debtPackaging)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : null
                                    })()}

                                    <div className="space-y-2">
                                        <Label htmlFor="notes">Notes (optionnel)</Label>
                                        <Textarea
                                            id="notes"
                                            placeholder="Instructions de livraison, remarques..."
                                            rows={2}
                                            value={notes}
                                            onChange={e => setNotes(e.target.value)}
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* Navigation entre étapes */}
                    <div className="flex justify-between pt-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                if (currentStepIndex > 0) setStep(steps[currentStepIndex - 1])
                                else router.push('/dashboard/sales')
                            }}
                        >
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            {currentStepIndex === 0 ? 'Annuler' : 'Précédent'}
                        </Button>

                        {step !== 'payment' ? (
                            <Button
                                onClick={() => setStep(steps[currentStepIndex + 1])}
                                disabled={
                                    (step === 'client' && (!selectedClient || !selectedDepotId)) ||
                                    (step === 'products' && orderItems.length === 0)
                                }
                            >
                                Suivant
                                <ChevronRight className="h-4 w-4 ml-2" />
                            </Button>
                        ) : (
                            <Button
                                onClick={handleSubmit}
                                disabled={isLoading || totalAmount === 0}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Enregistrement...
                                    </>
                                ) : (
                                    <>
                                        <ShoppingCart className="h-4 w-4 mr-2" />
                                        Valider la vente
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
