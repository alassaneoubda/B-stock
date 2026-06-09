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
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

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
    const [error, setError] = useState<string | null>(null)

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

    useEffect(() => {
        async function fetchDepot() {
            try {
                const res = await fetch(`/api/depots/${depotId}`)
                const result = await res.json()
                if (!res.ok || !result.data) {
                    setError('Dépôt introuvable')
                    return
                }
                const d = result.data
                reset({
                    name: d.name || '',
                    address: d.address || '',
                    phone: d.phone || '',
                    isMain: !!d.is_main,
                })
            } catch {
                setError('Erreur lors du chargement')
            } finally {
                setIsFetching(false)
            }
        }
        fetchDepot()
    }, [depotId, reset])

    async function onSubmit(data: DepotForm) {
        setIsLoading(true)
        setError(null)
        try {
            const response = await fetch(`/api/depots/${depotId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            })
            const result = await response.json()
            if (!response.ok) {
                setError(result.error || 'Une erreur est survenue')
                return
            }
            router.push('/dashboard/depots')
            router.refresh()
        } catch {
            setError('Une erreur est survenue. Veuillez réessayer.')
        } finally {
            setIsLoading(false)
        }
    }

    if (isFetching) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Modifier le dépôt" description="Chargement..." />
                <main className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </main>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader title="Modifier le dépôt" description="Mettre à jour les informations" />
            <main className="flex-1 p-4 lg:p-6">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/depots">
                            <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                        </Link>
                    </Button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
                    {error && (
                        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Informations dépôt</CardTitle>
                            <CardDescription>Coordonnées du dépôt</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nom *</Label>
                                <Input id="name" {...register('name')} disabled={isLoading} />
                                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="address">Adresse</Label>
                                    <Input id="address" {...register('address')} disabled={isLoading} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Téléphone</Label>
                                    <Input id="phone" {...register('phone')} disabled={isLoading} />
                                </div>
                            </div>

                            <div className="flex items-center justify-between rounded-lg border p-4">
                                <div>
                                    <Label htmlFor="isMain">Dépôt principal</Label>
                                    <p className="text-xs text-muted-foreground">Le dépôt par défaut pour les opérations</p>
                                </div>
                                <Switch
                                    id="isMain"
                                    checked={isMain}
                                    onCheckedChange={(checked) => setValue('isMain', checked)}
                                    disabled={isLoading}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-4">
                        <Button type="button" variant="outline" asChild disabled={isLoading}>
                            <Link href="/dashboard/depots">Annuler</Link>
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Enregistrer
                        </Button>
                    </div>
                </form>
            </main>
        </div>
    )
}
