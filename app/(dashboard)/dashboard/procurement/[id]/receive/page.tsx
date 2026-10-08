'use client'

import { useState, useEffect, useCallback, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageShell, StatusBadge } from '@/components/app/blocks'
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
    AlertTriangle,
} from 'lucide-react'
import Link from 'next/link'
import { useForm, useFieldArray } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, apiFetch, toastError, toastWarnings } from '@/lib/api-client'
import { formatNumber } from '@/lib/format'
import { ErrorState, PageSkeleton } from '@/components/states'
import { cn } from '@/lib/utils'
import { ScanButton, type ScanOutcome } from '@/components/scan/barcode-scanner'
import { useScannerInput } from '@/components/scan/use-scanner-input'
import { matchLabel, useBarcodeLookup, type BarcodeMatch } from '@/components/scan/use-barcode-lookup'
import { scanFeedback } from '@/components/scan/feedback'

interface POItem {
    id: string
    product_variant_id?: string | null
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
    variantId: string | null
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

    const { register, handleSubmit, control, reset, watch, setValue, getValues } = useForm<{ items: ReceiveLine[] }>({
        defaultValues: {
            items: []
        }
    })

    const { fields } = useFieldArray({
        control,
        name: "items"
    })

    const watchedItems = watch('items')

    // ----- Pointage par scan : 1er scan d'une ligne = 1 reçu, puis +1 à chaque scan -----
    const scannedLinesRef = useRef(new Set<string>())
    const [highlightLine, setHighlightLine] = useState<string | null>(null)

    function receiveScanned(match: BarcodeMatch): Exclude<ScanOutcome, void> {
        const label = matchLabel(match)
        const lines = getValues('items') ?? []
        const index = lines.findIndex((l) => l.variantId === match.variant_id && l.remaining > 0)
        if (index < 0) {
            const closed = lines.some((l) => l.variantId === match.variant_id)
            return { ok: false, message: closed ? `${label} : ligne déjà entièrement réceptionnée` : `${label} : absent de cette commande` }
        }
        const line = lines[index]
        const first = !scannedLinesRef.current.has(line.itemId)
        scannedLinesRef.current.add(line.itemId)
        const next = (first ? 0 : parseQuantity(line.quantityReceived) ?? 0) + 1
        setValue(`items.${index}.quantityReceived`, next, { shouldDirty: true })
        setHighlightLine(line.itemId)
        requestAnimationFrame(() => {
            document.querySelector(`[data-receive-line="${line.itemId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        })
        if (next > line.remaining) {
            return { ok: false, message: `${label} : ${formatNumber(next)} reçus, plus que le reste à réceptionner (${formatNumber(line.remaining)})` }
        }
        return { ok: true, message: `${label} : ${formatNumber(next)} / ${formatNumber(line.remaining)} reçu(s)` }
    }

    const { lookup: lookupBarcode, dialog: barcodeDialog } = useBarcodeLookup({
        onAssigned: (match) => {
            const outcome = receiveScanned(match)
            scanFeedback(outcome.ok)
            if (outcome.ok) toast.success(outcome.message)
            else toast.error(outcome.message)
        },
    })

    async function handleScan(code: string): Promise<Exclude<ScanOutcome, void>> {
        const result = await lookupBarcode(code)
        if (result.status === 'unknown') return { ok: false, message: 'Code-barres inconnu', close: true }
        if (result.status === 'error') return { ok: false, message: result.message }
        return receiveScanned(result.match)
    }

    useScannerInput(
        async (code) => {
            const outcome = await handleScan(code)
            scanFeedback(outcome.ok)
            if (outcome.ok) toast.success(outcome.message, { duration: 1500 })
            else if (!outcome.close) toast.error(outcome.message)
        },
        { enabled: Boolean(order && RECEIVABLE_STATUSES.includes(order.status)) && pendingSubmit === null }
    )

    useEffect(() => {
        if (!highlightLine) return
        const t = setTimeout(() => setHighlightLine(null), 2500)
        return () => clearTimeout(t)
    }, [highlightLine])

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
                    variantId: item.product_variant_id ?? null,
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
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Réception de marchandises" description="Réception de commande fournisseur" />
                <PageShell className="max-w-3xl">
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
                </PageShell>
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
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Réception de marchandises"
                description={`Pointage de la commande ${order.order_number}`}
            />

            <PageShell className="max-w-3xl">
                <div className="space-y-4">
                    <Button variant="ghost" size="sm" asChild className="-ml-2">
                        <Link href={`/dashboard/procurement/${id}`}>
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Commande {order.order_number}
                        </Link>
                    </Button>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div className="space-y-1">
                            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Réceptionner la commande</h2>
                            <p className="text-sm text-muted-foreground">
                                Pointez les quantités reçues en bon état et la casse. Le stock sera ajouté à {depotLabel}.
                            </p>
                        </div>
                        {isReceivable && (
                            <ScanButton
                                continuous
                                title="Pointer en scannant"
                                description="Premier scan d’une ligne : 1 reçu, puis +1 à chaque scan."
                                onDetected={handleScan}
                            />
                        )}
                    </div>
                </div>

                <form onSubmit={handleSubmit(onValidate)} className="space-y-6" noValidate>
                    {!isReceivable && (
                        <div role="status" className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm font-medium text-warning-foreground">
                            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {order.status === 'received'
                                ? 'Cette commande a déjà été entièrement réceptionnée.'
                                : 'Cette commande ne peut pas être réceptionnée dans son état actuel.'}
                        </div>
                    )}

                    {formError && (
                        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm font-medium text-destructive">
                            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {formError}
                        </div>
                    )}

                    <div className="space-y-4">
                        {fields.map((field, index) => {
                            const current = watchedItems?.[index] ?? field
                            const error = lineError(current)
                            const isClosed = field.remaining === 0
                            return (
                                <Card
                                    key={field.id}
                                    data-receive-line={field.itemId}
                                    className={cn('transition-colors', highlightLine === field.itemId && 'ring-2 ring-brand')}
                                >
                                    <CardHeader>
                                        <CardTitle>{field.productName}</CardTitle>
                                        {field.packagingName && <CardDescription>{field.packagingName}</CardDescription>}
                                        <CardAction>
                                            {isClosed ? (
                                                <StatusBadge label="Réceptionnée" tone="success" />
                                            ) : (
                                                <StatusBadge label="À réceptionner" tone="warning" />
                                            )}
                                        </CardAction>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <dl className="grid grid-cols-3 gap-3 rounded-lg bg-muted/40 p-3 text-sm">
                                            <div className="space-y-0.5">
                                                <dt className="text-xs text-muted-foreground">Commandé</dt>
                                                <dd className="tabular font-medium text-foreground">{formatNumber(field.quantityOrdered)}</dd>
                                            </div>
                                            <div className="space-y-0.5">
                                                <dt className="text-xs text-muted-foreground">Déjà traité</dt>
                                                <dd className="tabular font-medium text-foreground">
                                                    {field.alreadyReceived > 0 || field.alreadyDamaged > 0
                                                        ? `${formatNumber(field.alreadyReceived)} reçu(s) · ${formatNumber(field.alreadyDamaged)} casse`
                                                        : '—'}
                                                </dd>
                                            </div>
                                            <div className="space-y-0.5">
                                                <dt className="text-xs text-muted-foreground">Reste à réceptionner</dt>
                                                <dd className="tabular font-semibold text-foreground">{formatNumber(field.remaining)}</dd>
                                            </div>
                                        </dl>

                                        {isClosed ? (
                                            <p className="flex items-center gap-2 text-sm text-success">
                                                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                                Ligne entièrement réceptionnée
                                            </p>
                                        ) : (
                                            <div className="grid gap-4 md:grid-cols-2">
                                                <div className="space-y-2">
                                                    <Label htmlFor={`received-${index}`}>Quantité reçue *</Label>
                                                    <Input
                                                        id={`received-${index}`}
                                                        type="number"
                                                        min={0}
                                                        max={field.remaining}
                                                        step={1}
                                                        aria-invalid={error ? true : undefined}
                                                        {...register(`items.${index}.quantityReceived`)}
                                                        className="tabular h-10 text-right font-medium"
                                                        placeholder="0"
                                                    />
                                                    <p className="text-xs text-muted-foreground">Unités en bon état, ajoutées au stock.</p>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor={`damaged-${index}`}>Casse / manquants</Label>
                                                    <Input
                                                        id={`damaged-${index}`}
                                                        type="number"
                                                        min={0}
                                                        max={field.remaining}
                                                        step={1}
                                                        aria-invalid={error ? true : undefined}
                                                        {...register(`items.${index}.quantityDamaged`)}
                                                        className="tabular h-10 text-right"
                                                        placeholder="0"
                                                    />
                                                    <p className="text-xs text-muted-foreground">Tracées sur la commande, sans entrée en stock.</p>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor={`lot-${index}`}>Numéro de lot</Label>
                                                    <Input
                                                        id={`lot-${index}`}
                                                        {...register(`items.${index}.lotNumber`)}
                                                        className="h-10"
                                                        placeholder="Ex. : LOT-2024-001"
                                                    />
                                                    <p className="text-xs text-muted-foreground">Facultatif.</p>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor={`expiry-${index}`}>Date de péremption</Label>
                                                    <Input
                                                        id={`expiry-${index}`}
                                                        type="date"
                                                        {...register(`items.${index}.expiryDate`)}
                                                        className="h-10"
                                                    />
                                                    <p className="text-xs text-muted-foreground">Facultatif.</p>
                                                </div>
                                            </div>
                                        )}
                                        {!isClosed && error && (
                                            <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                                                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                                                {error}
                                            </p>
                                        )}
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-6">
                        <Button variant="outline" type="button" asChild>
                            <Link href={`/dashboard/procurement/${id}`}>Annuler</Link>
                        </Button>
                        <Button type="submit" variant="brand" disabled={isLoading || !isReceivable}>
                            {isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                                <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                            )}
                            Valider la réception
                        </Button>
                    </div>
                </form>
            </PageShell>

            {barcodeDialog}

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
                                    <strong className="tabular text-foreground">{formatNumber(confirmTotals.received)}</strong> unité(s) en bon état
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
                            onClick={(e) => {
                                e.preventDefault()
                                confirmSubmit()
                            }}
                        >
                            {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                            Confirmer la réception
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
