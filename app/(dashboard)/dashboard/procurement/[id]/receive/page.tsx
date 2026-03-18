'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
    ArrowLeft,
    Loader2,
    CheckCircle2,
    ArchiveRestore,
    Plus,
    Minus,
    Package,
    AlertTriangle
} from 'lucide-react'
import Link from 'next/link'
import { useForm, useFieldArray } from 'react-hook-form'

interface POItem {
    id: string
    product_name: string
    quantity_ordered: number
    quantity_received: number
    packaging_name: string
}

export default function ReceiveProcurementPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [isFetching, setIsFetching] = useState(true)
    const [order, setOrder] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)

    const { register, handleSubmit, control, setValue, watch } = useForm({
        defaultValues: {
            items: [] as any[]
        }
    })

    const { fields } = useFieldArray({
        control,
        name: "items"
    })

    useEffect(() => {
        async function fetchOrder() {
            try {
                const res = await fetch(`/api/procurement/${id}`)
                const data = await res.json()
                if (!res.ok) throw new Error(data.error)

                setOrder(data.data)

                // Set default values for items
                const initialItems = data.data.items.map((item: any) => ({
                    itemId: item.id,
                    productName: item.product_name,
                    packagingName: item.packaging_name,
                    quantityOrdered: item.quantity_ordered,
                    quantityReceived: item.quantity_ordered - (item.quantity_received || 0), // Default to remaining
                    quantityDamaged: 0,
                    lotNumber: '',
                    expiryDate: ''
                }))
                setValue('items', initialItems)
            } catch (err: any) {
                setError(err.message)
            } finally {
                setIsFetching(false)
            }
        }
        fetchOrder()
    }, [id, setValue])

    async function onSubmit(data: any) {
        setIsLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/procurement', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    purchaseOrderId: id,
                    items: data.items.map((item: any) => ({
                        itemId: item.itemId,
                        quantityReceived: Number(item.quantityReceived),
                        quantityDamaged: Number(item.quantityDamaged),
                        lotNumber: item.lotNumber,
                        expiryDate: item.expiryDate
                    }))
                })
            })

            if (!res.ok) {
                const result = await res.json()
                throw new Error(result.error || 'Erreur lors de la réception')
            }

            router.push(`/dashboard/procurement/${id}`)
            router.refresh()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
    }

    if (isFetching) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (error && !order) {
        return (
            <div className="p-10 text-center">
                <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <h3 className="text-xl font-bold">Erreur</h3>
                <p className="text-muted-foreground">{error}</p>
                <Button asChild className="mt-6">
                    <Link href="/dashboard/procurement">Retour</Link>
                </Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title="Décharger & Réceptionner"
                description={`Pointage de la commande ${order?.order_number}`}
            />

            <main className="flex-1 p-4 lg:p-6 max-w-5xl mx-auto w-full ">
                <div className="mb-6 flex items-center justify-between">
                    <Button variant="ghost" size="sm" asChild className="rounded-xl border border-slate-200">
                        <Link href={`/dashboard/procurement/${id}`}>
                            <ArrowLeft className="h-4 w-4 mr-2" /> Retour au détail
                        </Link>
                    </Button>
                    <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-md border border-blue-100">
                        <ArchiveRestore className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-semibold text-blue-700 tracking-tight uppercase tracking-wider text-[10px]">Réception de stock</span>
                    </div>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    {error && (
                        <div className="p-4 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm font-bold flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            {error}
                        </div>
                    )}

                    <div className="grid gap-6">
                        {fields.map((field, index) => (
                            <Card key={field.id} className="rounded-lg border-slate-200/60 shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300">
                                <CardContent className="p-8">
                                    <div className="flex flex-col md:flex-row gap-8">
                                        {/* Product Info */}
                                        <div className="md:w-1/3 space-y-4">
                                            <div className="flex items-start gap-4">
                                                <div className="h-12 w-12 rounded-md bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                                                    <Package className="h-6 w-6" />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-semibold text-lg text-slate-950 leading-tight">{(field as any).productName}</span>
                                                    <span className="inline-flex px-2.5 py-1 rounded-lg bg-slate-100 text-[10px] font-semibold text-slate-600 uppercase tracking-wider w-fit">
                                                        {(field as any).packagingName}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="p-4 rounded-md bg-amber-50/50 border border-amber-100/50">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="font-bold text-amber-700 uppercase tracking-wider text-[10px]">Quantité commandée :</span>
                                                    <span className="font-semibold text-amber-900">{(field as any).quantityOrdered}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Inputs */}
                                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Quantité Reçue *</Label>
                                                <div className="flex items-center gap-3">
                                                    <Input
                                                        type="number"
                                                        {...register(`items.${index}.quantityReceived`)}
                                                        className="h-12 rounded-xl text-lg font-semibold"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Casse / Manquants</Label>
                                                <Input
                                                    type="number"
                                                    {...register(`items.${index}.quantityDamaged`)}
                                                    className="h-12 rounded-xl border-dashed bg-rose-50/20 text-rose-600 font-bold"
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">N° Lot (Optionnel)</Label>
                                                <Input
                                                    {...register(`items.${index}.lotNumber`)}
                                                    className="h-12 rounded-xl"
                                                    placeholder="EX: LOT-2024-001"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Date Péremption</Label>
                                                <Input
                                                    type="date"
                                                    {...register(`items.${index}.expiryDate`)}
                                                    className="h-12 rounded-xl"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    <div className="flex items-center justify-end gap-4 pt-6">
                        <Button variant="outline" type="button" asChild className="rounded-md h-14 px-8 border-slate-200 font-bold">
                            <Link href={`/dashboard/procurement/${id}`}>Annuler</Link>
                        </Button>
                        <Button type="submit" disabled={isLoading} className="rounded-md h-14 px-10 bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-500/20 font-semibold text-lg group">
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
        </div>
    )
}
