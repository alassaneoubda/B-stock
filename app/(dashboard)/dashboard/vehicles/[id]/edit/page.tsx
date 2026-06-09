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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

const vehicleSchema = z.object({
    name: z.string().optional(),
    plateNumber: z.string().min(1, "Numéro d'immatriculation requis"),
    vehicleType: z.enum(['truck', 'tricycle', 'van']),
    capacityCases: z.coerce.number().min(0).optional(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
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
        defaultValues: { vehicleType: 'truck' },
    })

    const selectedVehicleType = watch('vehicleType')

    useEffect(() => {
        async function fetchVehicle() {
            try {
                const res = await fetch(`/api/vehicles/${vehicleId}`)
                const result = await res.json()
                if (!res.ok || !result.data) {
                    setError('Véhicule introuvable')
                    return
                }
                const v = result.data
                reset({
                    name: v.name || '',
                    plateNumber: v.plate_number || '',
                    vehicleType: v.vehicle_type || 'truck',
                    capacityCases: v.capacity_cases ?? undefined,
                    driverName: v.driver_name || '',
                    driverPhone: v.driver_phone || '',
                })
            } catch {
                setError('Erreur lors du chargement')
            } finally {
                setIsFetching(false)
            }
        }
        fetchVehicle()
    }, [vehicleId, reset])

    async function onSubmit(data: VehicleForm) {
        setIsLoading(true)
        setError(null)
        try {
            const response = await fetch(`/api/vehicles/${vehicleId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            })
            const result = await response.json()
            if (!response.ok) {
                setError(result.error || 'Une erreur est survenue')
                return
            }
            router.push('/dashboard/vehicles')
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
                <DashboardHeader title="Modifier le véhicule" description="Chargement..." />
                <main className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
                        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
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
                                        <SelectTrigger>
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
