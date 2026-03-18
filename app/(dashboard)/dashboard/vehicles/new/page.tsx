'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
    vehicleType: z.enum(['truck', 'tricycle', 'van']).default('truck'),
    capacityCases: z.any().transform(v => v === '' || Number.isNaN(Number(v)) ? undefined : Number(v)).optional(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
})

type VehicleForm = z.infer<typeof vehicleSchema>

const vehicleTypes = [
    { value: 'truck', label: 'Camion' },
    { value: 'van', label: 'Fourgonnette' },
    { value: 'tricycle', label: 'Tricycle' },
]

export default function NewVehiclePage() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors },
    } = useForm<VehicleForm>({
        resolver: zodResolver(vehicleSchema),
        defaultValues: {
            vehicleType: 'truck',
        }
    })

    const selectedVehicleType = watch('vehicleType')

    async function onSubmit(data: VehicleForm) {
        setIsLoading(true)
        setError(null)

        try {
            const response = await fetch('/api/vehicles', {
                method: 'POST',
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

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader
                title="Ajouter un véhicule"
                description="Créer un nouveau véhicule de livraison"
            />
            <main className="flex-1 p-4 lg:p-6 ">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/vehicles">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Retour
                        </Link>
                    </Button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
                    {error && (
                        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <Card className="rounded-lg border-slate-200/60 shadow-sm overflow-hidden">
                        <CardHeader className="px-8 py-8 border-b border-slate-100">
                            <CardTitle className="text-xl font-semibold text-slate-950">Nouveau véhicule</CardTitle>
                            <CardDescription>Informations et capacitiés du véhicule</CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 space-y-6">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="plateNumber">Plaque d'immatriculation *</Label>
                                    <Input
                                        id="plateNumber"
                                        placeholder="Ex: 1234 AB 01"
                                        {...register('plateNumber')}
                                        disabled={isLoading}
                                    />
                                    {errors.plateNumber && (
                                        <p className="text-sm text-destructive">{errors.plateNumber.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="name">Nom / Alias (Optionnel)</Label>
                                    <Input
                                        id="name"
                                        placeholder="Ex: Camion Livraison Nord"
                                        {...register('name')}
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="vehicleType">Type de véhicule</Label>
                                    <Select
                                        onValueChange={(value) => setValue('vehicleType', value as any)}
                                        value={selectedVehicleType}
                                        disabled={isLoading}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Sélectionner un type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {vehicleTypes.map((type) => (
                                                <SelectItem key={type.value} value={type.value}>
                                                    {type.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.vehicleType && (
                                        <p className="text-sm text-destructive">{errors.vehicleType.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="capacityCases">Capacité (en casiers)</Label>
                                    <Input
                                        id="capacityCases"
                                        type="number"
                                        min="0"
                                        placeholder="Ex: 200"
                                        {...register('capacityCases', { setValueAs: v => v === "" ? undefined : parseInt(v, 10) })}
                                        disabled={isLoading}
                                    />
                                    {errors.capacityCases && (
                                        <p className="text-sm text-destructive">{errors.capacityCases.message}</p>
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="driverName">Chauffeur attitré</Label>
                                    <Input
                                        id="driverName"
                                        placeholder="Nom du chauffeur"
                                        {...register('driverName')}
                                        disabled={isLoading}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="driverPhone">Téléphone du chauffeur</Label>
                                    <Input
                                        id="driverPhone"
                                        placeholder="+225 0102030405"
                                        {...register('driverPhone')}
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-4">
                        <Button type="button" variant="outline" asChild disabled={isLoading}>
                            <Link href="/dashboard/vehicles">Annuler</Link>
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Création...
                                </>
                            ) : (
                                'Enregistrer le véhicule'
                            )}
                        </Button>
                    </div>
                </form>
            </main>
        </div>
    )
}
