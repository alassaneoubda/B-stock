'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch, errorMessage } from '@/lib/api-client'

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
            await apiFetch('/api/vehicles', { method: 'POST', body: data })
            toast.success('Véhicule ajouté')
            router.push('/dashboard/vehicles')
            router.refresh()
        } catch (e) {
            // Erreur affichée dans le formulaire (message du serveur, ex. immatriculation déjà utilisée)
            setError(errorMessage(e))
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Nouveau véhicule"
                description="Ajouter un véhicule de livraison à votre flotte"
            />
            <PageShell>
                <div className="mx-auto w-full max-w-3xl space-y-6">
                    <Button variant="ghost" size="sm" asChild className="-ml-2">
                        <Link href="/dashboard/vehicles">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            Véhicules
                        </Link>
                    </Button>

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
                                        placeholder="Ex. 1234 AB 01"
                                        {...register('plateNumber')}
                                        disabled={isLoading}
                                        aria-invalid={!!errors.plateNumber}
                                    />
                                    {errors.plateNumber && (
                                        <p className="text-xs text-destructive">{errors.plateNumber.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="name">Nom ou alias</Label>
                                    <Input
                                        id="name"
                                        placeholder="Ex. Camion livraison nord"
                                        {...register('name')}
                                        disabled={isLoading}
                                    />
                                    <p className="text-xs text-muted-foreground">Facultatif, pour le reconnaître facilement.</p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="vehicleType">Type de véhicule</Label>
                                    <Select
                                        onValueChange={(value) => setValue('vehicleType', value as any)}
                                        value={selectedVehicleType}
                                        disabled={isLoading}
                                    >
                                        <SelectTrigger id="vehicleType" className="w-full">
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
                                        <p className="text-xs text-destructive">{errors.vehicleType.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="capacityCases">Capacité (casiers)</Label>
                                    <Input
                                        id="capacityCases"
                                        type="number"
                                        min="0"
                                        inputMode="numeric"
                                        placeholder="Ex. 200"
                                        className="tabular"
                                        {...register('capacityCases', { setValueAs: v => v === "" ? undefined : parseInt(v, 10) })}
                                        disabled={isLoading}
                                    />
                                    {errors.capacityCases ? (
                                        <p className="text-xs text-destructive">{String(errors.capacityCases.message ?? 'Capacité invalide')}</p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">Nombre de casiers transportables par tournée.</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Chauffeur</CardTitle>
                                <CardDescription>Chauffeur attitré à ce véhicule (facultatif)</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="driverName">Nom du chauffeur</Label>
                                    <Input
                                        id="driverName"
                                        placeholder="Nom et prénom"
                                        {...register('driverName')}
                                        disabled={isLoading}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="driverPhone">Téléphone</Label>
                                    <Input
                                        id="driverPhone"
                                        type="tel"
                                        placeholder="+225 01 02 03 04 05"
                                        className="tabular"
                                        {...register('driverPhone')}
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
                                {isLoading ? 'Enregistrement…' : 'Enregistrer le véhicule'}
                            </Button>
                        </div>
                    </form>
                </div>
            </PageShell>
        </div>
    )
}
