'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    ArrowLeft,
    Loader2,
    CheckCircle2,
    ArchiveRestore,
    Package,
    AlertTriangle
} from 'lucide-react'
import Link from 'next/link'
import { useForm, useFieldArray } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, apiFetch, toastError, toastWarnings } from '@/lib/api-client'
import { formatNumber } from '@/lib/format'
import { ErrorState, PageSkeleton } from '@/components/states'

interface POItem {
    id: string
    product_name: string
    quantity_ordered: number
    quantity_received: number | null
    quantity_damaged?: number | null
    packaging_name: string | null
}

interface PurchaseOrderDetail {
    id: string
    order_number: string
    status: string
    depot_name: string | null
    items: POItem[]
}

interface ReceiveLine {
    itemId: string
    productName: string
    packagingName: string
    quantityOrdered: number
    alreadyReceived: number
    alreadyDamaged: number
    remaining: number
    quantityReceived: string | number
    quantityDamaged: string | number
    lotNumber: string
    expiryDate: string
}

interface ReceiveResponse {
    success: boolean
    data: { status: string }
    message?: string
    warnings?: string[]
}

/** Statuts acceptés par l'API pour une réception (cf. RECEIVABLE_STATUSES). */
const RECEIVABLE_STATUSES = ['pending', 'confirmed', 'partial']

/** Quantité saisie → entier ≥ 0, ou null si invalide. Champ vide = 0. */
function parseQuantity(value: unknown): number | null {
    if (value === '' || value === null || value === undefined) return 0
    const n = Number(value)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null
    return n
}

/** Message d'erreur d'une ligne, ou null si elle est valide. */
function lineError(line: ReceiveLine): string | null {
    const received = parseQuantity(line.quantityReceived)
    const damaged = parseQuantity(line.quantityDamaged)
    if (received === null || damaged === null) return 'Saisissez des quantités entières positives.'
    if (received + damaged > line.remaining) {
        return `Reçu + casse (${formatNumber(received + damaged)}) dépasse le reste à réceptionner (${formatNumber(line.remaining)}).`
    }
    return null
}

export default function ReceiveProcurementPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [isFetching, setIsFetching] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [order, setOrder] = useState<PurchaseOrderDetail | null>(null)
    const [formError, setFormError] = useState<string | null>(null)
    const [pendingSubmit, setPendingSubmit] = useState<ReceiveLine[] | null>(null)

    const { register, handleSubmit, control, reset, watch } = useForm<{ items: ReceiveLine[] }>({
        defaultValues: {
            items: []
        }
    })

    const { fields } = useFieldArray({
        control,
        name: "items"
    })

    const watchedItems = watch('items')

    const fetchOrder = useCallback(async () => {
        setIsFetching(true)
        setLoadError(null)
        try {
            const res = await apiFetch<{ data: PurchaseOrderDetail }>(`/api/procurement/${id}`)
            setOrder(res.data)

            const initialItems: ReceiveLine[] = res.data.items.map((item) => {
                const ordered = Number(item.quantity_ordered) || 0
                const alreadyReceived = Number(item.quantity_received) || 0
                const alreadyDamaged = Number(item.quantity_damaged) || 0
                // Reste à recevoir : commandé − déjà reçu − déjà déclaré cassé
                const remaining = Math.max(0, ordered - alreadyReceived - alreadyDamaged)
                return {
                    itemId: item.id,
                    productName: item.product_name,
                    packagingName: item.packaging_name || '',
                    quantityOrdered: ordered,
                    alreadyReceived,
                    alreadyDamaged,
                    remaining,
                    quantityReceived: remaining,
                    quantityDamaged: 0,
                    lotNumber: '',
                    expiryDate: ''
                }
            })
            reset({ items: initialItems })
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : 'Impossible de charger la commande.')
        } finally {
            setIsFetching(false)
        }
    }, [id, reset])

    useEffect(() => {
        fetchOrder()
    }, [fetchOrder])

    // Étape 1 : validation locale puis demande de confirmation
    function onValidate(data: { items: ReceiveLine[] }) {
        setFormError(null)
        const invalid = data.items.find((line) => lineError(line) !== null)
        if (invalid) {
            setFormError(`${invalid.productName} : ${lineError(invalid)}`)
            return
        }
        const total = data.items.reduce(
            (sum, line) => sum + (parseQuantity(line.quantityReceived) ?? 0) + (parseQuantity(line.quantityDamaged) ?? 0),
            0
        )
        if (total === 0) {
            setFormError('Aucune quantité à réceptionner : saisissez au moins une quantité reçue ou cassée.')
            return
        }
        setPendingSubmit(data.items)
    }

    // Étape 2 : envoi après confirmation
    async function confirmSubmit() {
        if (!pendingSubmit || isLoading) return
        setIsLoading(true)
        try {
            const res = await apiFetch<ReceiveResponse>('/api/procurement', {
                method: 'POST',
                body: {
                    purchaseOrderId: id,
                    items: pendingSubmit
                        .filter((line) => line.remaining > 0)
                        .map((line) => ({
                            itemId: line.itemId,
                            quantityReceived: parseQuantity(line.quantityReceived) ?? 0,
                            quantityDamaged: parseQuantity(line.quantityDamaged) ?? 0,
                            lotNumber: line.lotNumber,
                            expiryDate: line.expiryDate
                        }))
                }
            })

            toast.success(res.message || 'Réception enregistrée')
            toastWarnings(res.warnings)
            setPendingSubmit(null)
            router.push(`/dashboard/procurement/${id}`)
            router.refresh()
        } catch (err) {
            // 409 : commande déjà réceptionnée ou quantité dépassant le reste (réception concurrente)
            toastError(err, 'Réception impossible')
            setPendingSubmit(null)
            // Les quantités affichées sont périmées : on recharge la commande
            if (err instanceof ApiError && err.status === 409) fetchOrder()
        } finally {
            setIsLoading(false)
        }
    }

    if (isFetching && !order) {
        return <PageSkeleton />
    }

    if (loadError || !order) {
        return (
            <div className="flex flex-col min-h-screen bg-muted/30">
                <DashboardHeader title="Décharger & Réceptionner" description="Réception de commande fournisseur" />
                <main className="flex-1 p-4 lg:p-6 max-w-5xl mx-auto w-full space-y-4">
                    <ErrorState
                        title="Impossible de charger la commande"
                        description={loadError || undefined}
                        onRetry={fetchOrder}
                    />
                    <div className="text-center">
                        <Button variant="outline" asChild>
                            <Link href="/dashboard/procurement">Retour aux commandes</Link>
                        </Button>
                    </div>
                </main>
            </div>
        )
    }

    const isReceivable = RECEIVABLE_STATUSES.includes(order.status)
    const depotLabel = order.depot_name || 'le dépôt de destination'
    const confirmTotals = (pendingSubmit || []).reduce(
        (acc, line) => {
            acc.received += parseQuantity(line.quantityReceived) ?? 0
            acc.damaged += parseQuantity(line.quantityDamaged) ?? 0
            return acc
        },
        { received: 0, damaged: 0 }
    )

    return (
        <div className="flex flex-col min-h-screen bg-muted/30">
            <DashboardHeader
                title="Décharger & Réceptionner"
                description={`Pointage de la commande ${order.order_number}`}
            />

            <main className="flex-1 p-4 lg:p-6 max-w-5xl mx-auto w-full ">
                <div className="mb-6 flex items-center justify-between">
                    <Button variant="ghost" size="sm" asChild className="rounded-xl border border-border">
                        <Link href={`/dashboard/procurement/${id}`}>
                            <ArrowLeft className="h-4 w-4 mr-2" /> Retour au détail
                        </Link>
                    </Button>
                    <div className="flex items-center gap-2 px-4 py-2 bg-brand-soft rounded-md border border-brand/40">
                        <ArchiveRestore className="h-4 w-4 text-brand-strong" />
                        <span className="text-sm font-semibold text-brand-strong tracking-tight uppercase tracking-wider text-[10px]">Réception de stock</span>
                    </div>
                </div>

                <form onSubmit={handleSubmit(onValidate)} className="space-y-6" noValidate>
                    {!isReceivable && (
                        <div role="status" className="p-4 rounded-md bg-warning-soft border border-warning/30 text-warning-foreground text-sm font-bold flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            {order.status === 'received'
                                ? 'Cette commande a déjà été entièrement réceptionnée.'
                                : 'Cette commande ne peut pas être réceptionnée dans son état actuel.'}
                        </div>
                    )}

                    {formError && (
                        <div role="alert" className="p-4 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm font-bold flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            {formError}
                        </div>
                    )}

                    <div className="grid gap-6">
                        {fields.map((field, index) => {
                            const current = watchedItems?.[index] ?? field
                            const error = lineError(current)
                            const isClosed = field.remaining === 0
                            return (
                            <Card key={field.id} className="rounded-lg border-border shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300">
                                <CardContent className="p-8">
                                    <div className="flex flex-col md:flex-row gap-8">
                                        {/* Product Info */}
                                        <div className="md:w-1/3 space-y-4">
                                            <div className="flex items-start gap-4">
                                                <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                                                    <Package className="h-6 w-6" />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-semibold text-lg text-foreground leading-tight">{field.productName}</span>
                                                    {field.packagingName && (
                                                        <span className="inline-flex px-2.5 py-1 rounded-lg bg-muted text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-fit">
                                                            {field.packagingName}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="p-4 rounded-md bg-warning-soft border border-warning/30 space-y-1.5">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="font-bold text-warning-foreground uppercase tracking-wider text-[10px]">Quantité commandée :</span>
                                                    <span className="font-semibold text-warning-foreground">{formatNumber(field.quantityOrdered)}</span>
                                                </div>
                                                {(field.alreadyReceived > 0 || field.alreadyDamaged > 0) && (
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="font-bold text-warning-foreground uppercase tracking-wider text-[10px]">Déjà traité :</span>
                                                        <span className="font-semibold text-warning-foreground">
                                                            {formatNumber(field.alreadyReceived)} reçu(s) · {formatNumber(field.alreadyDamaged)} casse
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="font-bold text-warning-foreground uppercase tracking-wider text-[10px]">Reste à réceptionner :</span>
                                                    <span className="font-semibold text-warning-foreground">{formatNumber(field.remaining)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Inputs */}
                                        <div className="flex-1 space-y-4">
                                            {isClosed ? (
                                                <div className="p-4 rounded-md bg-success-soft border border-success/30 text-success text-sm font-semibold flex items-center gap-2">
                                                    <CheckCircle2 className="h-4 w-4" />
                                                    Ligne entièrement réceptionnée
                                                </div>
                                            ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <Label htmlFor={`received-${index}`} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Quantité Reçue *</Label>
                                                    <div className="flex items-center gap-3">
                                                        <Input
                                                            id={`received-${index}`}
                                                            type="number"
                                                            min={0}
                                                            max={field.remaining}
                                                            step={1}
                                                            aria-invalid={error ? true : undefined}
                                                            {...register(`items.${index}.quantityReceived`)}
                                                            className="h-12 rounded-xl text-lg font-semibold"
                                                            placeholder="0"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor={`damaged-${index}`} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Casse / Manquants</Label>
                                                    <Input
                                                        id={`damaged-${index}`}
                                                        type="number"
                                                        min={0}
                                                        max={field.remaining}
                                                        step={1}
                                                        aria-invalid={error ? true : undefined}
                                                        {...register(`items.${index}.quantityDamaged`)}
                                                        className="h-12 rounded-xl border-dashed bg-destructive/10 text-destructive font-bold"
                                                        placeholder="0"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor={`lot-${index}`} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">N° Lot (Optionnel)</Label>
                                                    <Input
                                                        id={`lot-${index}`}
                                                        {...register(`items.${index}.lotNumber`)}
                                                        className="h-12 rounded-xl"
                                                        placeholder="EX: LOT-2024-001"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor={`expiry-${index}`} className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Date Péremption</Label>
                                                    <Input
                                                        id={`expiry-${index}`}
                                                        type="date"
                                                        {...register(`items.${index}.expiryDate`)}
                                                        className="h-12 rounded-xl"
                                                    />
                                                </div>
                                            </div>
                                            )}
                                            {!isClosed && error && (
                                                <p role="alert" className="text-sm font-semibold text-destructive flex items-center gap-2">
                                                    <AlertTriangle className="h-4 w-4" />
                                                    {error}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            )
                        })}
                    </div>

                    <div className="flex items-center justify-end gap-4 pt-6">
                        <Button variant="outline" type="button" asChild className="rounded-md h-14 px-8 border-border font-bold">
                            <Link href={`/dashboard/procurement/${id}`}>Annuler</Link>
                        </Button>
                        <Button type="submit" disabled={isLoading || !isReceivable} className="rounded-md h-14 px-10 bg-success hover:bg-success shadow-md shadow-emerald-500/20 font-semibold text-lg group">
                            {isLoading ? (
                                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            ) : (
                                <CheckCircle2 className="h-5 w-5 mr-2 group-hover:scale-110 transition-transform" />
                            )}
                            Valider la réception
                        </Button>
                    </div>
                </form>
            </main>

            <AlertDialog
                open={pendingSubmit !== null}
                onOpenChange={(open) => {
                    if (!open && !isLoading) setPendingSubmit(null)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmer la réception ?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2 text-sm text-muted-foreground">
                                <p>
                                    <strong className="text-foreground">{formatNumber(confirmTotals.received)}</strong> unité(s) en bon état
                                    seront ajoutées au stock de <strong className="text-foreground">{depotLabel}</strong>.
                                </p>
                                {confirmTotals.damaged > 0 && (
                                    <p>
                                        {formatNumber(confirmTotals.damaged)} unité(s) seront déclarées en casse / manquants
                                        (tracées sur la commande, sans entrée en stock).
                                    </p>
                                )}
                                <p>Cette opération ne peut pas être annulée depuis cet écran.</p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isLoading}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isLoading}
                            className="bg-success hover:bg-success"
                            onClick={(e) => {
                                e.preventDefault()
                                confirmSubmit()
                            }}
                        >
                            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Confirmer la réception
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
