'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, StatusBadge } from '@/components/app/blocks'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { ErrorState, TableSkeleton } from '@/components/states'

const depotSchema = z.object({
    name: z.string().min(1, 'Le nom est requis'),
    address: z.string().optional(),
    phone: z.string().optional(),
    isMain: z.boolean().default(false),
})

type DepotForm = z.infer<typeof depotSchema>

export default function EditDepotPage() {
    const router = useRouter()
    const params = useParams()
    const depotId = params.id as string

    const [isLoading, setIsLoading] = useState(false)
    const [isFetching, setIsFetching] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [depotName, setDepotName] = useState('')
    const [wasMain, setWasMain] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        reset,
        formState: { errors },
    } = useForm<DepotForm>({
        resolver: zodResolver(depotSchema),
        defaultValues: { isMain: false },
    })

    const isMain = watch('isMain')

    const fetchDepot = useCallback(async () => {
        setIsFetching(true)
        setLoadError(null)
        try {
            const result = await apiFetch<{ data: any }>(`/api/depots/${depotId}`)
            const d = result.data
            setDepotName(d.name || '')
            setWasMain(!!d.is_main)
            reset({
                name: d.name || '',
                address: d.address || '',
                phone: d.phone || '',
                isMain: !!d.is_main,
            })
        } catch (e) {
            setLoadError(errorMessage(e))
        } finally {
            setIsFetching(false)
        }
    }, [depotId, reset])

    useEffect(() => {
        fetchDepot()
    }, [fetchDepot])

    async function onSubmit(data: DepotForm) {
        setIsLoading(true)
        setError(null)
        try {
            await apiFetch(`/api/depots/${depotId}`, { method: 'PATCH', body: data })
            toast.success('Dépôt mis à jour')
            router.push('/dashboard/depots')
            router.refresh()
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setIsLoading(false)
        }
    }

    async function handleDelete() {
        if (isDeleting) return
        setIsDeleting(true)
        try {
            await apiFetch(`/api/depots/${depotId}`, { method: 'DELETE' })
            toast.success('Dépôt supprimé')
            setConfirmDelete(false)
            router.push('/dashboard/depots')
            router.refresh()
        } catch (e) {
            // Ex. dépôt principal, dépôt contenant encore du stock ou déjà utilisé
            toastError(e, 'Suppression impossible')
            setConfirmDelete(false)
        } finally {
            setIsDeleting(false)
        }
    }

    const backLink = (
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
            <Link href="/dashboard/depots">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Dépôts
            </Link>
        </Button>
    )

    if (isFetching) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Modifier le dépôt" description="Chargement…" />
                <PageShell>
                    <div className="mx-auto w-full max-w-3xl space-y-6">
                        {backLink}
                        <TableSkeleton rows={5} columns={2} />
                    </div>
                </PageShell>
            </div>
        )
    }

    if (loadError) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Modifier le dépôt" />
                <PageShell>
                    <div className="mx-auto w-full max-w-3xl space-y-6">
                        {backLink}
                        <ErrorState title="Impossible de charger le dépôt" description={loadError} onRetry={fetchDepot} />
                    </div>
                </PageShell>
            </div>
        )
    }

    const busy = isLoading || isDeleting

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader title="Modifier le dépôt" description={depotName || 'Mettre à jour les informations'} />
            <PageShell>
                <div className="mx-auto w-full max-w-3xl space-y-6">
                    <div className="space-y-3">
                        {backLink}
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-2xl font-semibold tracking-tight text-foreground">{depotName}</h2>
                            {wasMain && <StatusBadge label="Principal" tone="brand" />}
                        </div>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        {error && (
                            <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                {error}
                            </div>
                        )}

                        <Card>
                            <CardHeader>
                                <CardTitle>Informations du dépôt</CardTitle>
                                <CardDescription>Nom et coordonnées de l&apos;entrepôt.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nom du dépôt *</Label>
                                    <Input id="name" {...register('name')} disabled={busy} aria-invalid={!!errors.name} />
                                    {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Téléphone</Label>
                                    <Input id="phone" type="tel" {...register('phone')} disabled={busy} />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="address">Adresse</Label>
                                    <Input id="address" {...register('address')} disabled={busy} />
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Statut</CardTitle>
                                <CardDescription>Le dépôt principal est utilisé par défaut pour vos opérations.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="isMain">Dépôt principal</Label>
                                        <p className="text-xs text-muted-foreground">Le dépôt par défaut pour les opérations.</p>
                                    </div>
                                    <Switch
                                        id="isMain"
                                        checked={isMain}
                                        onCheckedChange={(checked) => setValue('isMain', checked)}
                                        disabled={busy}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" asChild disabled={busy}>
                                <Link href="/dashboard/depots">Annuler</Link>
                            </Button>
                            <Button type="submit" disabled={busy}>
                                {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                {isLoading ? 'Enregistrement…' : 'Enregistrer'}
                            </Button>
                        </div>
                    </form>

                    {/* Zone de suppression : le dépôt principal ne peut pas être supprimé (refus de l'API) */}
                    <Card className="border-destructive/30">
                        <CardHeader>
                            <CardTitle>Supprimer le dépôt</CardTitle>
                            <CardDescription>
                                {wasMain
                                    ? 'Le dépôt principal ne peut pas être supprimé. Désignez d’abord un autre dépôt comme principal.'
                                    : 'Possible uniquement si le dépôt ne contient plus aucun stock (produits et emballages).'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex justify-end">
                            <Button
                                type="button"
                                variant="destructive"
                                disabled={busy || wasMain}
                                onClick={() => setConfirmDelete(true)}
                            >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                Supprimer ce dépôt
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </PageShell>

            <AlertDialog
                open={confirmDelete}
                onOpenChange={(open) => {
                    if (!open && !isDeleting) setConfirmDelete(false)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer « {depotName} » ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Le dépôt sera définitivement supprimé. La suppression est refusée s’il contient encore
                            du stock ou s’il est référencé par des opérations (ventes, transferts…) : videz ou
                            transférez d’abord son stock. Cette action est irréversible.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={(e) => {
                                e.preventDefault()
                                handleDelete()
                            }}
                        >
                            {isDeleting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
