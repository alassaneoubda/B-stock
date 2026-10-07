'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell } from '@/components/app/blocks'
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

    const backLink = (
        <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/dashboard/packaging">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Emballages
            </Link>
        </Button>
    )

    if (isFetching) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Modifier l'emballage" description="Chargement…" />
                <PageShell>
                    <div className="mx-auto w-full max-w-3xl space-y-6">
                        {backLink}
                        <div className="rounded-xl border border-border bg-card p-5">
                            <TableSkeleton rows={4} columns={1} />
                        </div>
                    </div>
                </PageShell>
            </div>
        )
    }

    if (loadError) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Modifier l'emballage" />
                <PageShell>
                    <div className="mx-auto w-full max-w-3xl space-y-6">
                        {backLink}
                        <ErrorState
                            title="Impossible de charger l'emballage"
                            description={loadError}
                            onRetry={() => setReloadKey((k) => k + 1)}
                        />
                    </div>
                </PageShell>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Modifier l'emballage"
                description="Caractéristiques et consigne du contenant"
            />
            <PageShell>
                <div className="mx-auto w-full max-w-3xl space-y-6">
                {backLink}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    {error && (
                        <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Caractéristiques</CardTitle>
                            <CardDescription>Nom du contenant et nombre d&apos;unités qu&apos;il contient.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nom de l&apos;emballage *</Label>
                                <Input
                                    id="name"
                                    placeholder="Ex. : Casier 24 bouteilles"
                                    {...register('name')}
                                    disabled={isLoading}
                                />
                                {errors.name && (
                                    <p className="text-xs text-destructive">{errors.name.message}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="unitsPerCase">Unités par emballage *</Label>
                                <Input
                                    id="unitsPerCase"
                                    type="number"
                                    min="1"
                                    placeholder="Ex. : 24"
                                    className="tabular"
                                    {...register('unitsPerCase', { valueAsNumber: true })}
                                    disabled={isLoading}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Nombre de bouteilles ou canettes contenues.
                                </p>
                                {errors.unitsPerCase && (
                                    <p className="text-xs text-destructive">{errors.unitsPerCase.message}</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Consigne</CardTitle>
                            <CardDescription>Suivi des emballages à retourner par les clients.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
                                <div className="space-y-0.5">
                                    <Label htmlFor="isReturnable">Emballage consigné</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Les clients doivent rendre cet emballage.
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
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="depositPrice">Montant de la consigne (FCFA) *</Label>
                                        <Input
                                            id="depositPrice"
                                            type="number"
                                            min="0"
                                            placeholder="Ex. : 1500"
                                            className="tabular"
                                            {...register('depositPrice', { valueAsNumber: true })}
                                            disabled={isLoading}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Facturé si le client ne rend pas l&apos;emballage.
                                        </p>
                                        {errors.depositPrice && (
                                            <p className="text-xs text-destructive">{errors.depositPrice.message}</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <AlertDialog open={deleteOpen} onOpenChange={(next) => !isDeleting && setDeleteOpen(next)}>
                            <AlertDialogTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    disabled={isLoading || isDeleting}
                                >
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
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
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                        {isDeleting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
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
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                    Enregistrement…
                                </>
                            ) : (
                                'Enregistrer'
                            )}
                        </Button>
                    </div>
                </form>
                </div>
            </PageShell>
        </div>
    )
}
