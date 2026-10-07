'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { ErrorState } from '@/components/states'

const vehicleSchema = z.object({
    name: z.string().optional(),
    plateNumber: z.string().min(1, "Numéro d'immatriculation requis"),
    vehicleType: z.enum(['truck', 'tricycle', 'van']),
    capacityCases: z.coerce.number().min(0).optional(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
    isActive: z.boolean().optional(),
})

type VehicleForm = z.infer<typeof vehicleSchema>

const vehicleTypes = [
    { value: 'truck', label: 'Camion' },
    { value: 'van', label: 'Fourgonnette' },
    { value: 'tricycle', label: 'Tricycle' },
]

function BackLink() {
    return (
        <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/dashboard/vehicles">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Véhicules
            </Link>
        </Button>
    )
}

export default function EditVehiclePage() {
    const router = useRouter()
    const params = useParams()
    const vehicleId = params.id as string

    const [isLoading, setIsLoading] = useState(false)
    const [isFetching, setIsFetching] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        reset,
        formState: { errors },
    } = useForm<VehicleForm>({
        resolver: zodResolver(vehicleSchema),
        defaultValues: { vehicleType: 'truck', isActive: true },
    })

    const selectedVehicleType = watch('vehicleType')
    const isActive = watch('isActive')

    const fetchVehicle = useCallback(async () => {
        setIsFetching(true)
        setLoadError(null)
        try {
            const result = await apiFetch<{ data: any }>(`/api/vehicles/${vehicleId}`)
            const v = result.data
            reset({
                name: v.name || '',
                plateNumber: v.plate_number || '',
                vehicleType: v.vehicle_type || 'truck',
                capacityCases: v.capacity_cases ?? undefined,
                driverName: v.driver_name || '',
                driverPhone: v.driver_phone || '',
                isActive: v.is_active !== false,
            })
        } catch (e) {
            setLoadError(errorMessage(e))
        } finally {
            setIsFetching(false)
        }
    }, [vehicleId, reset])

    useEffect(() => {
        fetchVehicle()
    }, [fetchVehicle])

    async function onSubmit(data: VehicleForm) {
        setIsLoading(true)
        setError(null)
        try {
            await apiFetch(`/api/vehicles/${vehicleId}`, { method: 'PATCH', body: data })
            toast.success('Véhicule mis à jour')
            router.push('/dashboard/vehicles')
            router.refresh()
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setIsLoading(false)
        }
    }

    if (isFetching) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Modifier le véhicule" description="Mettre à jour les informations" />
                <PageShell>
                    <div className="mx-auto w-full max-w-3xl space-y-6" aria-busy="true" aria-label="Chargement">
                        <Skeleton className="h-8 w-28" />
                        <Skeleton className="h-72 rounded-xl" />
                        <Skeleton className="h-40 rounded-xl" />
                    </div>
                </PageShell>
            </div>
        )
    }

    if (loadError) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Modifier le véhicule" description="Mettre à jour les informations" />
                <PageShell>
                    <div className="mx-auto w-full max-w-3xl space-y-6">
                        <BackLink />
                        <ErrorState title="Impossible de charger le véhicule" description={loadError} onRetry={fetchVehicle} />
                    </div>
                </PageShell>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader title="Modifier le véhicule" description="Mettre à jour les informations" />
            <PageShell>
                <div className="mx-auto w-full max-w-3xl space-y-6">
                    <BackLink />

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        {error && (
                            <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                                {error}
                            </div>
                        )}

                        <Card>
                            <CardHeader>
                                <CardTitle>Véhicule</CardTitle>
                                <CardDescription>Identification et capacité de chargement</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="plateNumber">Plaque d&apos;immatriculation *</Label>
                                    <Input
                                        id="plateNumber"
                                        {...register('plateNumber')}
                                        disabled={isLoading}
                                        aria-invalid={!!errors.plateNumber}
                                    />
                                    {errors.plateNumber && <p className="text-xs text-destructive">{errors.plateNumber.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nom ou alias</Label>
                                    <Input id="name" {...register('name')} disabled={isLoading} />
                                    <p className="text-xs text-muted-foreground">Facultatif, pour le reconnaître facilement.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="vehicleType">Type de véhicule</Label>
                                    <Select
                                        onValueChange={(value) => setValue('vehicleType', value as VehicleForm['vehicleType'])}
                                        value={selectedVehicleType}
                                        disabled={isLoading}
                                    >
                                        <SelectTrigger id="vehicleType" className="w-full">
                                            <SelectValue placeholder="Sélectionner un type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {vehicleTypes.map((t) => (
                                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="capacityCases">Capacité (casiers)</Label>
                                    <Input
                                        id="capacityCases"
                                        type="number"
                                        min="0"
                                        inputMode="numeric"
                                        className="tabular"
                                        {...register('capacityCases')}
                                        disabled={isLoading}
                                        aria-invalid={!!errors.capacityCases}
                                    />
                                    {errors.capacityCases ? (
                                        <p className="text-xs text-destructive">Capacité invalide</p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">Nombre de casiers transportables par tournée.</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Chauffeur et disponibilité</CardTitle>
                                <CardDescription>Chauffeur attitré et mise en service</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="driverName">Nom du chauffeur</Label>
                                        <Input id="driverName" {...register('driverName')} disabled={isLoading} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="driverPhone">Téléphone</Label>
                                        <Input id="driverPhone" type="tel" className="tabular" {...register('driverPhone')} disabled={isLoading} />
                                    </div>
                                </div>

                                {/* Permet de remettre en service un véhicule désactivé (retiré du parc après des tournées) */}
                                <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="isActive">En service</Label>
                                        <p className="text-xs text-muted-foreground">Un véhicule indisponible ne peut plus être affecté à une tournée.</p>
                                    </div>
                                    <Switch
                                        id="isActive"
                                        checked={isActive !== false}
                                        onCheckedChange={(checked) => setValue('isActive', checked)}
                                        disabled={isLoading}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button type="button" variant="outline" asChild disabled={isLoading}>
                                <Link href="/dashboard/vehicles">Annuler</Link>
                            </Button>
                            <Button type="submit" disabled={isLoading}>
                                {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                {isLoading ? 'Enregistrement…' : 'Enregistrer les modifications'}
                            </Button>
                        </div>
                    </form>
                </div>
            </PageShell>
        </div>
    )
}
