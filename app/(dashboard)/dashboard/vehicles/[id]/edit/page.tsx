'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DashboardHeader } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { ErrorState, PageSkeleton } from '@/components/states'

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
        return <PageSkeleton />
    }

    if (loadError) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Modifier le véhicule" description="Mettre à jour les informations" />
                <main className="flex-1 p-4 lg:p-6 space-y-4">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/vehicles">
                            <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                        </Link>
                    </Button>
                    <ErrorState title="Impossible de charger le véhicule" description={loadError} onRetry={fetchVehicle} />
                </main>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader title="Modifier le véhicule" description="Mettre à jour les informations" />
            <main className="flex-1 p-4 lg:p-6">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/vehicles">
                            <ArrowLeft className="h-4 w-4 mr-2" /> Retour
                        </Link>
                    </Button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
                    {error && (
                        <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Informations véhicule</CardTitle>
                            <CardDescription>Caractéristiques et chauffeur</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="plateNumber">Plaque d&apos;immatriculation *</Label>
                                    <Input id="plateNumber" {...register('plateNumber')} disabled={isLoading} />
                                    {errors.plateNumber && <p className="text-sm text-destructive">{errors.plateNumber.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nom / Alias</Label>
                                    <Input id="name" {...register('name')} disabled={isLoading} />
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="vehicleType">Type de véhicule</Label>
                                    <Select
                                        onValueChange={(value) => setValue('vehicleType', value as VehicleForm['vehicleType'])}
                                        value={selectedVehicleType}
                                        disabled={isLoading}
                                    >
                                        <SelectTrigger id="vehicleType">
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
                                    <Input id="capacityCases" type="number" min="0" {...register('capacityCases')} disabled={isLoading} />
                                    {errors.capacityCases && <p className="text-sm text-destructive">Capacité invalide</p>}
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="driverName">Chauffeur attitré</Label>
                                    <Input id="driverName" {...register('driverName')} disabled={isLoading} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="driverPhone">Téléphone du chauffeur</Label>
                                    <Input id="driverPhone" {...register('driverPhone')} disabled={isLoading} />
                                </div>
                            </div>

                            {/* Permet de remettre en service un véhicule désactivé (retiré du parc après des tournées) */}
                            <div className="flex items-center justify-between rounded-lg border p-4">
                                <div>
                                    <Label htmlFor="isActive">En service</Label>
                                    <p className="text-xs text-muted-foreground">Un véhicule indisponible ne peut plus être affecté à une tournée</p>
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

                    <div className="flex justify-end gap-4">
                        <Button type="button" variant="outline" asChild disabled={isLoading}>
                            <Link href="/dashboard/vehicles">Annuler</Link>
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
