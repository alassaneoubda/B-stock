'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    Loader2,
    ArrowLeft,
    Search,
    Plus,
    Minus,
    Trash2,
    ShoppingCart,
    Package,
    CreditCard,
    Banknote,
    Smartphone,
    ChevronRight,
    AlertTriangle,
    BoxesIcon,
    Boxes,
    Check,
    Split,
} from 'lucide-react'
import Link from 'next/link'
import { apiFetch, errorMessage, toastError, toastWarnings } from '@/lib/api-client'
import { formatMoney, formatNumber, formatSignedMoney } from '@/lib/format'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { EmptyState, TableSkeleton } from '@/components/states'
import { cn } from '@/lib/utils'

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

/** /api/clients/[id] renvoie `accounts` au lieu des soldes agrégés de la liste. */
function normalizeClient(raw: any): Client {
    const balanceOf = (type: string) =>
        Array.isArray(raw.accounts)
            ? raw.accounts
                .filter((a: any) => a.account_type === type)
                .reduce((sum: number, a: any) => sum + Number(a.balance || 0), 0)
            : 0
    return {
        ...raw,
        credit_limit: Number(raw.credit_limit || 0),
        packaging_credit_limit: Number(raw.packaging_credit_limit || 0),
        product_balance: raw.product_balance !== undefined ? Number(raw.product_balance) : balanceOf('product'),
        packaging_balance: raw.packaging_balance !== undefined ? Number(raw.packaging_balance) : balanceOf('packaging'),
    }
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
    // Part en espèces d'un paiement mixte (null = tout le montant encaissé)
    const [cashAmount, setCashAmount] = useState<number | null>(null)
    const [orderSource, setOrderSource] = useState<'in_person' | 'phone' | 'whatsapp' | 'other'>('in_person')
    const [notes, setNotes] = useState('')

    useEffect(() => {
        if (preloadClientId) {
            apiFetch(`/api/clients/${preloadClientId}`)
                .then(d => {
                    if (d?.data) setSelectedClient(normalizeClient(d.data))
                })
                .catch(e => toastError(e, 'Client introuvable'))
        }

        // Charger les dépôts
        setLoadingDepots(true)
        apiFetch('/api/depots')
            .then(d => {
                const list = d.data || d.depots || []
                setDepots(list)
                const main = list.find((dp: any) => dp.is_main)
                if (main) setSelectedDepotId(main.id)
                else if (list.length > 0) setSelectedDepotId(list[0].id)
            })
            .catch(e => toastError(e, 'Impossible de charger les dépôts'))
            .finally(() => setLoadingDepots(false))
    }, [preloadClientId])

    // Rechercher des clients (recherche différée de 300 ms)
    const debouncedClientSearch = useDebouncedValue(clientSearch.trim(), 300)
    useEffect(() => {
        if (!debouncedClientSearch) {
            setClients([])
            return
        }
        const controller = new AbortController()
        setLoadingClients(true)
        apiFetch(`/api/clients?search=${encodeURIComponent(debouncedClientSearch)}&limit=50`, { signal: controller.signal })
            .then(d => setClients((d.data || d.clients || []).map(normalizeClient)))
            .catch(e => toastError(e, 'Recherche de clients impossible'))
            .finally(() => {
                if (!controller.signal.aborted) setLoadingClients(false)
            })
        return () => controller.abort()
    }, [debouncedClientSearch])

    // Charger les produits avec le stock DU DÉPÔT SÉLECTIONNÉ
    // (auparavant le stock de tous les dépôts était additionné).
    useEffect(() => {
        if (step === 'products' && selectedDepotId) {
            setLoadingProducts(true)
            apiFetch(`/api/stock?depotId=${encodeURIComponent(selectedDepotId)}`)
                .then(d => {
                    const stockData = d.data || []
                    // Consolider les lots d'un même variant dans ce dépôt
                    const consolidated: Record<string, ProductVariant> = {}

                    stockData.forEach((s: any) => {
                        if (s.depot_id !== selectedDepotId) return
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
                .catch(e => toastError(e, 'Impossible de charger le stock'))
                .finally(() => setLoadingProducts(false))
        }
    }, [step, selectedDepotId])

    // Charger les emballages
    useEffect(() => {
        if (step === 'packaging') {
            apiFetch('/api/packaging')
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
                .catch(e => toastError(e, 'Impossible de charger les emballages'))
        }
    }, [step])

    const totalProducts = orderItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const totalPackagingOut = packagingItems.reduce((s, i) => s + i.quantityOut * i.depositPrice, 0)
    const totalPackagingIn = packagingItems.reduce((s, i) => s + i.quantityIn * i.depositPrice, 0)
    const totalPackaging = totalPackagingOut - totalPackagingIn
    const totalAmount = Math.max(0, totalProducts + totalPackaging)
    const remainingToPay = totalAmount - paidAmount
    const effectiveCashAmount = Math.min(paidAmount, Math.max(0, cashAmount ?? paidAmount))

    // Plafond de crédit (contrôlé aussi côté serveur) : dette produits créée par cette vente
    const effectivePaidForDebt = paymentMethod === 'credit' ? 0 : paidAmount
    const newProductDebt = Math.max(0, totalProducts - Math.min(totalProducts, effectivePaidForDebt))
    const currentProductDebt = selectedClient ? Math.max(0, -Number(selectedClient.product_balance || 0)) : 0
    const creditLimit = selectedClient ? Number(selectedClient.credit_limit || 0) : 0
    const exceedsCreditLimit =
        creditLimit > 0 && newProductDebt > 0 && currentProductDebt + newProductDebt > creditLimit

    // Espèces / Mobile Money = paiement intégral : le montant encaissé suit le total.
    // (Auparavant il restait à 0 et une vente « Espèces » créait une dette fictive.)
    useEffect(() => {
        if (paymentMethod === 'cash' || paymentMethod === 'mobile_money') {
            setPaidAmount(totalAmount)
        } else if (paymentMethod === 'credit') {
            setPaidAmount(0)
        }
    }, [paymentMethod, totalAmount])

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

    function changeDepot(depotId: string) {
        if (depotId === selectedDepotId) return
        setSelectedDepotId(depotId)
        setVariants([])
        if (orderItems.length > 0) {
            setOrderItems([])
            toast.info('Dépôt modifié : le panier a été vidé (le stock dépend du dépôt).')
        }
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
            const result = await apiFetch('/api/sales', {
                method: 'POST',
                body: {
                    clientId: selectedClient.id,
                    depotId: selectedDepotId,
                    orderSource,
                    paymentMethod,
                    paidAmount: paymentMethod === 'credit' ? 0 : paidAmount,
                    ...(paymentMethod === 'mixed' ? { cashAmount: effectiveCashAmount } : {}),
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
                },
            })

            toast.success(`Vente ${result.data.order_number} enregistrée`)
            toastWarnings(result.warnings)
            router.push(`/dashboard/sales/${result.data.id}`)
            router.refresh()
        } catch (e) {
            setError(errorMessage(e))
            toastError(e, 'Vente non enregistrée')
        } finally {
            setIsLoading(false)
        }
    }

    const steps: Step[] = ['client', 'products', 'packaging', 'payment']
    const currentStepIndex = steps.indexOf(step)

    const nextDisabled =
        (step === 'client' && (!selectedClient || !selectedDepotId)) ||
        (step === 'products' && orderItems.length === 0)
    const selectedDepotName = depots.find((d) => d.id === selectedDepotId)?.name as string | undefined
    const itemsCount = orderItems.reduce((s, i) => s + i.quantity, 0)

    function goBack() {
        if (currentStepIndex > 0) setStep(steps[currentStepIndex - 1])
        else router.push('/dashboard/sales')
    }

    /** Action principale (Suivant / Valider), affichée dans le résumé (écran large) ou la barre du bas (mobile). */
    function renderPrimaryAction(className?: string) {
        return step !== 'payment' ? (
            <Button size="xl" className={className} onClick={() => setStep(steps[currentStepIndex + 1])} disabled={nextDisabled}>
                Suivant
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </Button>
        ) : (
            <Button variant="brand" size="xl" className={className} onClick={handleSubmit} disabled={isLoading || totalAmount === 0}>
                {isLoading ? (
                    <>
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                        Enregistrement…
                    </>
                ) : (
                    <>
                        <Check className="h-5 w-5" aria-hidden="true" />
                        Valider la vente
                    </>
                )}
            </Button>
        )
    }

    const paymentLabels: Record<typeof paymentMethod, string> = {
        cash: 'Espèces',
        mobile_money: 'Mobile Money',
        credit: 'Crédit',
        mixed: 'Mixte',
    }

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader title="Nouvelle vente" description="Enregistrez une commande client" />

            <PageShell>
                <div className="space-y-4">
                    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
                        <Link href="/dashboard/sales">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            Ventes
                        </Link>
                    </Button>

                    {/* Étapes */}
                    <nav aria-label="Étapes de la vente">
                        <ol className="flex items-center gap-2 overflow-x-auto rounded-xl border border-border bg-card p-2 sm:gap-0">
                            {STEPS.map((s, i) => {
                                const isDone = i < currentStepIndex
                                const isActive = s.id === step
                                return (
                                    <li key={s.id} className="flex shrink-0 items-center sm:flex-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (isDone) setStep(s.id)
                                            }}
                                            disabled={!isDone && !isActive}
                                            aria-current={isActive ? 'step' : undefined}
                                            className={cn(
                                                'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                                                isActive && 'bg-brand-soft',
                                                isDone && 'hover:bg-muted',
                                                !isDone && !isActive && 'cursor-not-allowed'
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    'tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                                                    isActive && 'bg-brand text-brand-foreground',
                                                    isDone && 'bg-primary text-primary-foreground',
                                                    !isDone && !isActive && 'border border-border text-muted-foreground'
                                                )}
                                            >
                                                {isDone ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
                                            </span>
                                            <span
                                                className={cn(
                                                    'font-medium',
                                                    isActive ? 'text-foreground' : isDone ? 'text-foreground' : 'text-muted-foreground'
                                                )}
                                            >
                                                {s.label}
                                                {isDone && <span className="sr-only"> (terminé)</span>}
                                            </span>
                                        </button>
                                        {i < STEPS.length - 1 && (
                                            <span className="mx-1 hidden h-px w-6 shrink-0 bg-border sm:block lg:w-10" aria-hidden="true" />
                                        )}
                                    </li>
                                )
                            })}
                        </ol>
                    </nav>
                </div>

                {error && (
                    <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        {error}
                    </div>
                )}

                <div className="grid items-start gap-6 lg:grid-cols-3">
                    <div className="min-w-0 space-y-4 lg:col-span-2">
                        {/* ÉTAPE 1 : CLIENT */}
                        {step === 'client' && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Client et dépôt</CardTitle>
                                    <CardDescription>Recherchez le client par nom ou numéro de téléphone.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-5">
                                    {selectedClient ? (
                                        <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/40 p-4">
                                            <div className="min-w-0 space-y-1">
                                                <p className="font-semibold text-foreground">{selectedClient.name}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {[selectedClient.phone, selectedClient.zone].filter(Boolean).join(' · ') || 'Aucune coordonnée'}
                                                </p>
                                                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
                                                    <span className="text-muted-foreground">
                                                        Produits{' '}
                                                        <span className={cn('tabular font-medium', Number(selectedClient.product_balance) < 0 ? 'text-destructive' : 'text-success')}>
                                                            {formatSignedMoney(selectedClient.product_balance)}
                                                        </span>
                                                    </span>
                                                    <span className="text-muted-foreground">
                                                        Emballages{' '}
                                                        <span className={cn('tabular font-medium', Number(selectedClient.packaging_balance) < 0 ? 'text-warning-foreground' : 'text-success')}>
                                                            {formatSignedMoney(selectedClient.packaging_balance)}
                                                        </span>
                                                    </span>
                                                </div>
                                                {creditLimit > 0 && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Plafond de crédit <span className="tabular">{formatMoney(creditLimit)}</span> · dette actuelle{' '}
                                                        <span className="tabular">{formatMoney(currentProductDebt)}</span>
                                                    </p>
                                                )}
                                            </div>
                                            <Button variant="outline" size="sm" onClick={() => setSelectedClient(null)}>
                                                Changer
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="relative">
                                                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                                <Input
                                                    placeholder="Nom ou téléphone du client…"
                                                    aria-label="Rechercher un client"
                                                    className="h-12 rounded-lg pl-10 text-base"
                                                    value={clientSearch}
                                                    onChange={e => setClientSearch(e.target.value)}
                                                />
                                                {loadingClients && (
                                                    <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Recherche en cours" />
                                                )}
                                            </div>
                                            {clients.length > 0 && (
                                                <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                                                    {clients.map(c => (
                                                        <li key={c.id}>
                                                            <button
                                                                type="button"
                                                                className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                                                                onClick={() => { setSelectedClient(c); setClientSearch('') }}
                                                            >
                                                                <span className="min-w-0">
                                                                    <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                                                                    {c.phone && <span className="block text-xs text-muted-foreground">{c.phone}</span>}
                                                                </span>
                                                                <Badge variant="muted">{c.zone || 'Sans zone'}</Badge>
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            {clientSearch && !loadingClients && clients.length === 0 && (
                                                <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm">
                                                    <p className="text-muted-foreground">
                                                        Aucun client trouvé.{' '}
                                                        <Link href="/dashboard/clients/new" target="_blank" rel="noopener" className="font-medium text-brand-strong hover:underline">
                                                            Créer ce client
                                                        </Link>
                                                    </p>
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        S’ouvre dans un nouvel onglet : votre saisie est conservée ici, revenez ensuite rechercher le client.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="orderSource">Source de la commande</Label>
                                            <Select value={orderSource} onValueChange={v => setOrderSource(v as typeof orderSource)}>
                                                <SelectTrigger id="orderSource" className="w-full data-[size=default]:h-11">
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
                                            <Label htmlFor="depot">Dépôt de départ</Label>
                                            <Select value={selectedDepotId} onValueChange={changeDepot} disabled={loadingDepots}>
                                                <SelectTrigger id="depot" className="w-full data-[size=default]:h-11">
                                                    <SelectValue placeholder="Sélectionner un dépôt" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {depots.map(d => (
                                                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-muted-foreground">Le stock disponible dépend du dépôt choisi.</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* ÉTAPE 2 : PRODUITS */}
                        {step === 'products' && (
                            <>
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Produits</CardTitle>
                                        <CardDescription>
                                            Touchez un produit pour l’ajouter{selectedDepotName ? ` · stock du dépôt ${selectedDepotName}` : ''}.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="relative">
                                            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                            <Input
                                                placeholder="Rechercher un produit…"
                                                aria-label="Rechercher un produit"
                                                className="h-12 rounded-lg pl-10 text-base"
                                                value={productSearch}
                                                onChange={e => setProductSearch(e.target.value)}
                                            />
                                        </div>

                                        {loadingProducts ? (
                                            <TableSkeleton rows={4} columns={2} />
                                        ) : filteredVariants.length === 0 ? (
                                            <EmptyState
                                                icon={Package}
                                                title={productSearch ? 'Aucun produit ne correspond' : 'Aucun produit en stock dans ce dépôt'}
                                                description={productSearch ? undefined : 'Approvisionnez ce dépôt ou choisissez-en un autre à l’étape Client.'}
                                            />
                                        ) : (
                                            <ul className="grid max-h-[26rem] gap-2 overflow-y-auto sm:grid-cols-2">
                                                {filteredVariants.map(v => {
                                                    const inOrder = orderItems.find(i => i.variantId === v.id)
                                                    const outOfStock = v.available_stock <= 0
                                                    return (
                                                        <li key={v.id}>
                                                            <button
                                                                type="button"
                                                                onClick={() => addItem(v)}
                                                                disabled={outOfStock}
                                                                aria-label={`Ajouter ${v.product_name}${v.volume ? ` (${v.volume})` : ''}`}
                                                                className={cn(
                                                                    'flex min-h-16 w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                                                                    inOrder ? 'border-brand bg-brand-soft' : 'border-border bg-card hover:bg-muted/60'
                                                                )}
                                                            >
                                                                <span className="min-w-0">
                                                                    <span className="block truncate text-sm font-medium text-foreground">
                                                                        {v.product_name}
                                                                        {v.volume && <span className="font-normal text-muted-foreground"> · {v.volume}</span>}
                                                                    </span>
                                                                    <span className="tabular block text-xs text-muted-foreground">
                                                                        {formatMoney(v.selling_price)} · {outOfStock ? 'Rupture' : `${formatNumber(v.available_stock)} en stock`}
                                                                    </span>
                                                                </span>
                                                                {inOrder ? (
                                                                    <span className="tabular flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full bg-brand px-2 text-xs font-semibold text-brand-foreground">
                                                                        {formatNumber(inOrder.quantity)}
                                                                    </span>
                                                                ) : (
                                                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
                                                                        <Plus className="h-4 w-4" aria-hidden="true" />
                                                                    </span>
                                                                )}
                                                            </button>
                                                        </li>
                                                    )
                                                })}
                                            </ul>
                                        )}
                                    </CardContent>
                                </Card>

                                {orderItems.length > 0 && (
                                    <Card className="gap-0 py-0">
                                        <CardHeader className="border-b border-border py-4">
                                            <CardTitle>Panier</CardTitle>
                                            <CardDescription>
                                                {orderItems.length} produit{orderItems.length > 1 ? 's' : ''} · {formatNumber(itemsCount)} unité{itemsCount > 1 ? 's' : ''}
                                            </CardDescription>
                                        </CardHeader>
                                        <ul className="divide-y divide-border">
                                            {orderItems.map(item => (
                                                <li key={item.variantId} className="flex flex-wrap items-center gap-3 px-5 py-3 sm:flex-nowrap">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium text-foreground">
                                                            {item.productName}
                                                            {item.volume && <span className="font-normal text-muted-foreground"> · {item.volume}</span>}
                                                        </p>
                                                        <p className="tabular text-xs text-muted-foreground">{formatMoney(item.unitPrice)} / unité</p>
                                                    </div>
                                                    <div className="flex items-center rounded-lg border border-border">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon-lg"
                                                            className="rounded-r-none"
                                                            onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                                                            disabled={item.quantity <= 1}
                                                            aria-label={`Diminuer la quantité de ${item.productName}`}
                                                        >
                                                            <Minus className="h-4 w-4" aria-hidden="true" />
                                                        </Button>
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            max={item.availableStock}
                                                            value={item.quantity}
                                                            onChange={e => updateQuantity(item.variantId, Number(e.target.value))}
                                                            aria-label={`Quantité de ${item.productName}`}
                                                            className="tabular h-10 w-16 rounded-none border-0 border-x border-border text-center shadow-none focus-visible:ring-0"
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon-lg"
                                                            className="rounded-l-none"
                                                            onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                                                            disabled={item.quantity >= item.availableStock}
                                                            aria-label={`Augmenter la quantité de ${item.productName}`}
                                                        >
                                                            <Plus className="h-4 w-4" aria-hidden="true" />
                                                        </Button>
                                                    </div>
                                                    <p className="tabular w-28 text-right text-sm font-semibold text-foreground">
                                                        {formatMoney(item.quantity * item.unitPrice)}
                                                    </p>
                                                    <Button
                                                        size="icon-lg"
                                                        variant="ghost"
                                                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                        onClick={() => removeItem(item.variantId)}
                                                        aria-label={`Retirer ${item.productName}`}
                                                    >
                                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                    </Button>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-5 py-3 text-sm">
                                            <span className="text-muted-foreground">Total produits</span>
                                            <span className="tabular font-semibold text-foreground">{formatMoney(totalProducts)}</span>
                                        </div>
                                    </Card>
                                )}
                            </>
                        )}

                        {/* ÉTAPE 3 : EMBALLAGES */}
                        {step === 'packaging' && (
                            <Card className="gap-0 py-0">
                                <CardHeader className="border-b border-border py-4">
                                    <CardTitle>Emballages</CardTitle>
                                    <CardDescription>Casiers sortis (livrés) et rendus par le client. Laissez 0 si aucun.</CardDescription>
                                </CardHeader>
                                {packagingItems.length === 0 ? (
                                    <div className="p-5">
                                        <EmptyState
                                            icon={Boxes}
                                            title="Aucun type d’emballage configuré"
                                            description="Vous pouvez passer cette étape ou configurer vos emballages."
                                            action={{ label: 'Configurer les emballages', href: '/dashboard/packaging/new' }}
                                        />
                                    </div>
                                ) : (
                                    <>
                                        <div className="hidden grid-cols-12 gap-3 border-b border-border bg-muted/40 px-5 py-2.5 text-xs font-medium text-muted-foreground sm:grid">
                                            <span className="col-span-6">Emballage</span>
                                            <span className="col-span-3 text-center">Sortis (+)</span>
                                            <span className="col-span-3 text-center">Rendus (−)</span>
                                        </div>
                                        <ul className="divide-y divide-border">
                                            {packagingItems.map((pkg, idx) => {
                                                const active = pkg.quantityOut > 0 || pkg.quantityIn > 0
                                                return (
                                                    <li
                                                        key={pkg.packagingTypeId}
                                                        className={cn('grid grid-cols-2 items-center gap-3 px-5 py-3 sm:grid-cols-12', active && 'bg-brand-soft/50')}
                                                    >
                                                        <div className="col-span-2 sm:col-span-6">
                                                            <p className="text-sm font-medium text-foreground">{pkg.name}</p>
                                                            <p className="tabular text-xs text-muted-foreground">{formatMoney(pkg.depositPrice)} / casier</p>
                                                        </div>
                                                        <div className="space-y-1 sm:col-span-3">
                                                            <Label htmlFor={`out-${pkg.packagingTypeId}`} className="text-xs text-muted-foreground sm:sr-only">
                                                                Sortis (+)
                                                            </Label>
                                                            <Input
                                                                id={`out-${pkg.packagingTypeId}`}
                                                                type="number"
                                                                min="0"
                                                                value={pkg.quantityOut}
                                                                onChange={e => {
                                                                    const val = Math.max(0, Number(e.target.value))
                                                                    setPackagingItems(prev => prev.map((p, i) => i === idx ? { ...p, quantityOut: val } : p))
                                                                }}
                                                                className="tabular h-11 text-center"
                                                            />
                                                        </div>
                                                        <div className="space-y-1 sm:col-span-3">
                                                            <Label htmlFor={`in-${pkg.packagingTypeId}`} className="text-xs text-muted-foreground sm:sr-only">
                                                                Rendus (−)
                                                            </Label>
                                                            <Input
                                                                id={`in-${pkg.packagingTypeId}`}
                                                                type="number"
                                                                min="0"
                                                                value={pkg.quantityIn}
                                                                onChange={e => {
                                                                    const val = Math.max(0, Number(e.target.value))
                                                                    setPackagingItems(prev => prev.map((p, i) => i === idx ? { ...p, quantityIn: val } : p))
                                                                }}
                                                                className="tabular h-11 text-center"
                                                            />
                                                        </div>
                                                    </li>
                                                )
                                            })}
                                        </ul>
                                        {totalPackaging !== 0 && (
                                            <dl className="space-y-1.5 border-t border-border bg-muted/40 px-5 py-3 text-sm">
                                                <div className="flex justify-between">
                                                    <dt className="text-muted-foreground">Emballages sortis</dt>
                                                    <dd className="tabular text-foreground">+{formatMoney(totalPackagingOut)}</dd>
                                                </div>
                                                {totalPackagingIn > 0 && (
                                                    <div className="flex justify-between">
                                                        <dt className="text-muted-foreground">Emballages rendus</dt>
                                                        <dd className="tabular text-success">−{formatMoney(totalPackagingIn)}</dd>
                                                    </div>
                                                )}
                                                <div className="flex justify-between font-semibold">
                                                    <dt className="text-foreground">Net emballages</dt>
                                                    <dd className="tabular text-foreground">{formatMoney(totalPackaging)}</dd>
                                                </div>
                                            </dl>
                                        )}
                                    </>
                                )}
                            </Card>
                        )}

                        {/* ÉTAPE 4 : PAIEMENT */}
                        {step === 'payment' && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Paiement</CardTitle>
                                    <CardDescription>Choisissez le mode de paiement et le montant encaissé.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-5">
                                    <div role="radiogroup" aria-label="Mode de paiement" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                        {[
                                            { value: 'cash', label: 'Espèces', icon: Banknote },
                                            { value: 'mobile_money', label: 'Mobile Money', icon: Smartphone },
                                            { value: 'credit', label: 'Crédit', icon: CreditCard },
                                            { value: 'mixed', label: 'Mixte', icon: Split },
                                        ].map(({ value, label, icon: Icon }) => {
                                            const selected = paymentMethod === value
                                            return (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={selected}
                                                    onClick={() => {
                                                        setPaymentMethod(value as typeof paymentMethod)
                                                        if (value === 'cash' || value === 'mobile_money') setPaidAmount(totalAmount)
                                                    }}
                                                    className={cn(
                                                        'flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                                                        selected
                                                            ? 'border-primary bg-primary text-primary-foreground'
                                                            : 'border-border bg-card text-foreground hover:bg-muted/60'
                                                    )}
                                                >
                                                    <Icon className="h-5 w-5" aria-hidden="true" />
                                                    {label}
                                                </button>
                                            )
                                        })}
                                    </div>

                                    {paymentMethod !== 'credit' && (
                                        <div className="grid gap-4 md:grid-cols-2">
                                                <div className="space-y-2">
                                                    <Label htmlFor="paidAmount">Montant encaissé (FCFA)</Label>
                                                    <Input
                                                        id="paidAmount"
                                                        type="number"
                                                        inputMode="numeric"
                                                        min="0"
                                                        max={totalAmount}
                                                        value={paidAmount}
                                                        onChange={e => setPaidAmount(Number(e.target.value))}
                                                        className="tabular h-12 text-lg font-semibold"
                                                    />
                                                    {remainingToPay > 0 && paymentMethod === 'mixed' && (
                                                        <p className="tabular text-xs font-medium text-warning-foreground">
                                                            Reste en crédit : {formatMoney(remainingToPay)}
                                                        </p>
                                                    )}
                                                </div>

                                            {paymentMethod === 'mixed' && (
                                                <div className="space-y-2">
                                                    <Label htmlFor="cashAmount">Dont espèces (FCFA)</Label>
                                                    <Input
                                                        id="cashAmount"
                                                        type="number"
                                                        inputMode="numeric"
                                                        min="0"
                                                        max={paidAmount}
                                                        value={cashAmount ?? paidAmount}
                                                        onChange={e => setCashAmount(Math.max(0, Number(e.target.value)))}
                                                        className="tabular h-12 text-lg"
                                                    />
                                                    <p className="text-xs text-muted-foreground">
                                                        Seule la part en espèces est enregistrée en caisse
                                                        {paidAmount - effectiveCashAmount > 0 && ` · Mobile Money / autre : ${formatMoney(paidAmount - effectiveCashAmount)}`}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {(paymentMethod === 'credit' || paymentMethod === 'mixed') && selectedClient && (
                                        <div
                                            role={exceedsCreditLimit ? 'alert' : undefined}
                                            className={cn(
                                                'space-y-1 rounded-lg border px-4 py-3 text-sm',
                                                exceedsCreditLimit ? 'border-destructive/20 bg-destructive/5 text-destructive' : 'border-border bg-muted/40 text-foreground'
                                            )}
                                        >
                                            <p>
                                                Plafond de crédit :{' '}
                                                <span className="tabular font-medium">{creditLimit > 0 ? formatMoney(creditLimit) : 'aucun plafond défini'}</span>
                                            </p>
                                            <p className={exceedsCreditLimit ? undefined : 'text-muted-foreground'}>
                                                Dette actuelle <span className="tabular">{formatMoney(currentProductDebt)}</span> · nouvelle dette{' '}
                                                <span className="tabular">{formatMoney(newProductDebt)}</span>
                                            </p>
                                            {exceedsCreditLimit && (
                                                <p className="flex items-start gap-1.5 pt-1 font-medium">
                                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                                    Plafond dépassé de {formatMoney(currentProductDebt + newProductDebt - creditLimit)} : la vente sera refusée. Encaissez davantage ou augmentez le plafond du client.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Aperçu de la répartition du paiement */}
                                    {(() => {
                                        const effectivePaid = paymentMethod === 'credit' ? 0 : paidAmount
                                        const allocProducts = Math.min(totalProducts, effectivePaid)
                                        const allocPackaging = Math.min(totalPackaging, Math.max(0, effectivePaid - totalProducts))
                                        const debtProducts = totalProducts - allocProducts
                                        const debtPackaging = totalPackaging - allocPackaging
                                        return (debtProducts > 0 || debtPackaging > 0) ? (
                                            <div className="grid gap-4 rounded-lg border border-border px-4 py-3 text-sm sm:grid-cols-2">
                                                <dl className="space-y-1.5">
                                                    <p className="text-xs font-medium text-muted-foreground">Répartition du paiement</p>
                                                    <div className="flex justify-between gap-3">
                                                        <dt className="text-muted-foreground">Payé produits</dt>
                                                        <dd className="tabular font-medium text-foreground">{formatMoney(allocProducts)}</dd>
                                                    </div>
                                                    <div className="flex justify-between gap-3">
                                                        <dt className="text-muted-foreground">Payé emballages</dt>
                                                        <dd className="tabular font-medium text-foreground">{formatMoney(allocPackaging)}</dd>
                                                    </div>
                                                </dl>
                                                <dl className="space-y-1.5 sm:border-l sm:border-border sm:pl-4">
                                                    <p className="text-xs font-medium text-muted-foreground">Dettes créées</p>
                                                    {debtProducts > 0 && (
                                                        <div className="flex justify-between gap-3">
                                                            <dt className="text-muted-foreground">Dette produits</dt>
                                                            <dd className="tabular font-medium text-destructive">{formatMoney(debtProducts)}</dd>
                                                        </div>
                                                    )}
                                                    {debtPackaging > 0 && (
                                                        <div className="flex justify-between gap-3">
                                                            <dt className="text-muted-foreground">Dette emballages</dt>
                                                            <dd className="tabular font-medium text-warning-foreground">{formatMoney(debtPackaging)}</dd>
                                                        </div>
                                                    )}
                                                </dl>
                                            </div>
                                        ) : null
                                    })()}

                                    <div className="space-y-2">
                                        <Label htmlFor="notes">Notes</Label>
                                        <Textarea
                                            id="notes"
                                            placeholder="Instructions de livraison, remarques…"
                                            rows={2}
                                            value={notes}
                                            onChange={e => setNotes(e.target.value)}
                                        />
                                        <p className="text-xs text-muted-foreground">Facultatif.</p>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Navigation (écran large) */}
                        <div className="hidden items-center justify-between lg:flex">
                            <Button variant="outline" size="lg" onClick={goBack}>
                                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                                {currentStepIndex === 0 ? 'Annuler' : 'Précédent'}
                            </Button>
                            <p className="text-xs text-muted-foreground">
                                Étape {currentStepIndex + 1} sur {STEPS.length}
                            </p>
                        </div>
                    </div>

                    {/* Résumé collant (écran large) */}
                    <aside className="hidden lg:sticky lg:top-20 lg:block" aria-label="Résumé de la vente">
                        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
                            <div className="border-b border-border px-5 py-3.5">
                                <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Résumé</h2>
                                <p className="text-xs text-muted-foreground">Mis à jour à chaque étape</p>
                            </div>
                            <dl className="space-y-2.5 px-5 py-4 text-sm">
                                <div className="flex justify-between gap-3">
                                    <dt className="text-muted-foreground">Client</dt>
                                    <dd className="truncate text-right font-medium text-foreground">{selectedClient?.name || '—'}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="text-muted-foreground">Dépôt</dt>
                                    <dd className="truncate text-right text-foreground">{selectedDepotName || '—'}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="text-muted-foreground">
                                        Produits{orderItems.length > 0 && <span className="tabular"> ({formatNumber(itemsCount)})</span>}
                                    </dt>
                                    <dd className="tabular text-foreground">{formatMoney(totalProducts)}</dd>
                                </div>
                                {totalPackaging !== 0 && (
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Emballages (net)</dt>
                                        <dd className="tabular text-foreground">{formatMoney(totalPackaging)}</dd>
                                    </div>
                                )}
                                {step === 'payment' && (
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Paiement</dt>
                                        <dd className="text-foreground">{paymentLabels[paymentMethod]}</dd>
                                    </div>
                                )}
                            </dl>
                            <div className="space-y-4 border-t border-border bg-muted/40 px-5 py-4">
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="text-sm font-medium text-foreground">Total</span>
                                    <span className="tabular text-2xl font-semibold tracking-tight text-foreground">{formatMoney(totalAmount)}</span>
                                </div>
                                {step === 'payment' && paymentMethod !== 'cash' && paymentMethod !== 'mobile_money' && (
                                    <div className="flex justify-between gap-3 text-sm">
                                        <span className="text-muted-foreground">Reste en crédit</span>
                                        <span className="tabular font-medium text-warning-foreground">
                                            {formatMoney(paymentMethod === 'credit' ? totalAmount : Math.max(0, remainingToPay))}
                                        </span>
                                    </div>
                                )}
                                {renderPrimaryAction('w-full')}
                            </div>
                        </section>
                    </aside>
                </div>
            </PageShell>

            {/* Barre d'action collante (mobile / tablette) */}
            <div className="sticky bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
                <div className="mx-auto flex max-w-3xl items-center gap-3">
                    <Button
                        variant="outline"
                        size="icon-lg"
                        className="h-12 w-12 shrink-0 rounded-lg"
                        onClick={goBack}
                        aria-label={currentStepIndex === 0 ? 'Annuler la vente' : 'Étape précédente'}
                    >
                        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                    </Button>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                            Total · étape {currentStepIndex + 1}/{STEPS.length}
                        </p>
                        <p className="tabular truncate text-lg font-semibold text-foreground">{formatMoney(totalAmount)}</p>
                    </div>
                    {renderPrimaryAction('shrink-0')}
                </div>
            </div>
        </div>
    )
}
