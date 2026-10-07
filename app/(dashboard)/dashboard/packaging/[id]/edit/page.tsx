'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DashboardHeader } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ErrorState, TableSkeleton } from '@/components/states'
import { apiFetch, errorMessage, toastError, toastWarnings } from '@/lib/api-client'

const packagingSchema = z.object({
    name: z.string().min(1, 'Le nom est requis'),
    unitsPerCase: z.number().int().min(1, 'Doit être au moins 1').default(1),
    isReturnable: z.boolean().default(true),
    depositPrice: z.number().min(0, 'Le prix doit être positif').default(0),
})

type PackagingForm = z.infer<typeof packagingSchema>

export default function EditPackagingPage() {
    const router = useRouter()
    const params = useParams()
    const packagingId = params.id as string

    const [isLoading, setIsLoading] = useState(false)
    const [isFetching, setIsFetching] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [reloadKey, setReloadKey] = useState(0)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        reset,
        formState: { errors },
    } = useForm<PackagingForm>({
        resolver: zodResolver(packagingSchema),
        defaultValues: {
            unitsPerCase: 1,
            isReturnable: true,
            depositPrice: 0,
        },
    })

    const isReturnable = watch('isReturnable')

    useEffect(() => {
        async function fetchPackaging() {
            setIsFetching(true)
            setLoadError(null)
            try {
                const result = await apiFetch<{ data: any }>(`/api/packaging/${packagingId}`)
                const p = result.data
                reset({
                    name: p.name || '',
                    unitsPerCase: Number(p.units_per_case) || 1,
                    isReturnable: p.is_returnable !== false,
                    depositPrice: Number(p.deposit_price) || 0,
                })
            } catch (e) {
                setLoadError(errorMessage(e))
            } finally {
                setIsFetching(false)
            }
        }
        fetchPackaging()
    }, [packagingId, reset, reloadKey])

    async function onSubmit(data: PackagingForm) {
        setIsLoading(true)
        setError(null)

        try {
            const result = await apiFetch<{ warnings?: unknown }>(`/api/packaging/${packagingId}`, {
                method: 'PATCH',
                body: data,
            })

            toast.success('Emballage mis à jour')
            toastWarnings(result?.warnings)
            router.push('/dashboard/packaging')
            router.refresh()
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setIsLoading(false)
        }
    }

    async function handleDelete() {
        setIsDeleting(true)
        try {
            const result = await apiFetch<{ message?: string; warnings?: unknown }>(`/api/packaging/${packagingId}`, {
                method: 'DELETE',
            })
            setDeleteOpen(false)
            toast.success(result?.message || 'Emballage supprimé')
            toastWarnings(result?.warnings)
            router.push('/dashboard/packaging')
            router.refresh()
        } catch (e) {
            // 400/409 : emballage utilisé par des variantes ou encore en stock
            setDeleteOpen(false)
            toastError(e, 'Suppression impossible')
        } finally {
            setIsDeleting(false)
        }
    }

    if (isFetching) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Modifier l'emballage" description="Chargement..." />
                <main className="flex-1 p-4 lg:p-6">
                    <div className="max-w-xl">
                        <TableSkeleton rows={4} columns={1} />
                    </div>
                </main>
            </div>
        )
    }

    if (loadError) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Modifier l'emballage" />
                <main className="flex-1 p-4 lg:p-6">
                    <div className="max-w-xl">
                        <ErrorState
                            title="Impossible de charger l'emballage"
                            description={loadError}
                            onRetry={() => setReloadKey((k) => k + 1)}
                        />
                    </div>
                </main>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader
                title="Modifier l'emballage"
                description="Mettez à jour les caractéristiques de l'emballage"
            />
            <main className="flex-1 p-4 lg:p-6 ">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/packaging">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Retour
                        </Link>
                    </Button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="max-w-xl space-y-6">
                    {error && (
                        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <Card className="rounded-lg border-border shadow-sm overflow-hidden">
                        <CardHeader className="px-8 py-8 border-b border-border">
                            <CardTitle className="text-xl font-semibold text-foreground">Modifier l&apos;emballage</CardTitle>
                            <CardDescription>Mettez à jour les caractéristiques du contenant.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nom de l&apos;emballage *</Label>
                                <Input
                                    id="name"
                                    placeholder="Ex: Casier 24 Bouteilles"
                                    {...register('name')}
                                    disabled={isLoading}
                                />
                                {errors.name && (
                                    <p className="text-sm text-destructive">{errors.name.message}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="unitsPerCase">Nombre d&apos;unités par emballage *</Label>
                                <Input
                                    id="unitsPerCase"
                                    type="number"
                                    min="1"
                                    placeholder="Ex: 24"
                                    {...register('unitsPerCase', { valueAsNumber: true })}
                                    disabled={isLoading}
                                />
                                <p className="text-sm text-muted-foreground">
                                    Combien de bouteilles/canettes contient cet emballage ?
                                </p>
                                {errors.unitsPerCase && (
                                    <p className="text-sm text-destructive">{errors.unitsPerCase.message}</p>
                                )}
                            </div>

                            <div className="space-y-4 pt-2">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label htmlFor="isReturnable" className="text-base">Consignable</Label>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Les clients doivent-ils retourner cet emballage ?
                                        </p>
                                    </div>
                                    <Switch
                                        id="isReturnable"
                                        checked={isReturnable}
                                        onCheckedChange={(checked) => setValue('isReturnable', checked)}
                                        disabled={isLoading}
                                    />
                                </div>

                                {isReturnable && (
                                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <Label htmlFor="depositPrice">Prix de la consigne (FCFA) *</Label>
                                        <Input
                                            id="depositPrice"
                                            type="number"
                                            min="0"
                                            placeholder="Ex: 1500"
                                            {...register('depositPrice', { valueAsNumber: true })}
                                            disabled={isLoading}
                                        />
                                        <p className="text-sm text-muted-foreground">
                                            Le montant facturé si le client ne rend pas l&apos;emballage.
                                        </p>
                                        {errors.depositPrice && (
                                            <p className="text-sm text-destructive">{errors.depositPrice.message}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-4">
                        <AlertDialog open={deleteOpen} onOpenChange={(next) => !isDeleting && setDeleteOpen(next)}>
                            <AlertDialogTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="mr-auto text-destructive hover:text-destructive hover:bg-destructive/10"
                                    disabled={isLoading || isDeleting}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Supprimer
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Supprimer cet emballage ?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Le type d&apos;emballage et ses équivalences seront supprimés définitivement.
                                        La suppression est refusée s&apos;il est utilisé par des variantes produit ou
                                        s&apos;il reste du stock de vides.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
                                    <AlertDialogAction
                                        disabled={isDeleting}
                                        onClick={(e) => {
                                            e.preventDefault()
                                            handleDelete()
                                        }}
                                        className="bg-destructive text-white hover:bg-destructive/90"
                                    >
                                        {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                        Supprimer
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        <Button type="button" variant="outline" asChild disabled={isLoading}>
                            <Link href="/dashboard/packaging">Annuler</Link>
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Enregistrement...
                                </>
                            ) : (
                                'Enregistrer'
                            )}
                        </Button>
                    </div>
                </form>
            </main>
        </div>
    )
}
