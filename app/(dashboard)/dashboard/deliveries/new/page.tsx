'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { apiFetch, errorMessage, toastError, toastWarnings } from '@/lib/api-client'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell } from '@/components/app/blocks'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Loader2, Truck, MapPin, RotateCw } from 'lucide-react'
import Link from 'next/link'

interface Vehicle {
    id: string
    name: string | null
    plate_number: string
    vehicle_type: string
    driver_name: string | null
}

interface Depot {
    id: string
    name: string
    is_main: boolean
}

export default function NewDeliveryPage() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [vehicles, setVehicles] = useState<Vehicle[]>([])
    const [depots, setDepots] = useState<Depot[]>([])
    const [loadingData, setLoadingData] = useState(true)
    const [loadError, setLoadError] = useState(false)

    // Form state
    const [tourDate, setTourDate] = useState(new Date().toISOString().split('T')[0])
    const [driverName, setDriverName] = useState('')
    const [vehicleId, setVehicleId] = useState<string>('')
    const [depotId, setDepotId] = useState<string>('')
    const [notes, setNotes] = useState('')

    // Validation
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

    const loadFormData = useCallback(async () => {
        setLoadingData(true)
        setLoadError(false)
        try {
            const [vehiclesData, depotsData] = await Promise.all([
                apiFetch('/api/vehicles'),
                apiFetch('/api/depots'),
            ])
            setVehicles(vehiclesData?.data || vehiclesData?.vehicles || [])
            setDepots(depotsData?.data || depotsData?.depots || [])
        } catch (err) {
            setLoadError(true)
            toastError(err, 'Chargement des véhicules et dépôts impossible')
        } finally {
            setLoadingData(false)
        }
    }, [])

    useEffect(() => {
        loadFormData()
    }, [loadFormData])

    // Auto-fill driver name when vehicle is selected
    useEffect(() => {
        if (vehicleId) {
            const vehicle = vehicles.find(v => v.id === vehicleId)
            if (vehicle?.driver_name && !driverName) {
                setDriverName(vehicle.driver_name)
            }
        }
    }, [vehicleId, vehicles, driverName])

    function validate(): boolean {
        const errs: Record<string, string> = {}
        if (!tourDate) errs.tourDate = 'La date est requise'
        if (!driverName.trim()) errs.driverName = 'Le nom du chauffeur est requis'
        setFieldErrors(errs)
        return Object.keys(errs).length === 0
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!validate()) return

        setIsLoading(true)
        setError(null)

        try {
            const result = await apiFetch('/api/deliveries', {
                method: 'POST',
                body: {
                    tourDate,
                    driverName: driverName.trim(),
                    vehicleId: vehicleId || null,
                    depotId: depotId || null,
                    notes: notes.trim() || undefined,
                },
            })
            toast.success('Tournée planifiée')
            toastWarnings(result?.warnings)
            router.push('/dashboard/deliveries')
            router.refresh()
        } catch (err) {
            // Erreur affichée en ligne au-dessus du formulaire
            setError(errorMessage(err))
            setIsLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Planifier une tournée"
                description="Créer une nouvelle tournée de livraison"
            />
            <PageShell>
                <form onSubmit={onSubmit} className="mx-auto w-full max-w-3xl space-y-6">
                    <Button variant="ghost" size="sm" asChild className="-ml-2">
                        <Link href="/dashboard/deliveries">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            Livraisons
                        </Link>
                    </Button>

                    {error && (
                        <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    {loadError && (
                        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning-foreground">
                            <span>Les véhicules et dépôts n&apos;ont pas pu être chargés.</span>
                            <Button type="button" size="sm" variant="outline" onClick={loadFormData}>
                                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                                Réessayer
                            </Button>
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Planning</CardTitle>
                            <CardDescription>Date de départ et chauffeur responsable de la tournée.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="tourDate">Date de la tournée *</Label>
                                    <Input
                                        id="tourDate"
                                        type="date"
                                        value={tourDate}
                                        onChange={e => setTourDate(e.target.value)}
                                        disabled={isLoading}
                                        aria-invalid={!!fieldErrors.tourDate}
                                    />
                                    {fieldErrors.tourDate && (
                                        <p className="text-xs text-destructive">{fieldErrors.tourDate}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="driverName">Chauffeur *</Label>
                                    <Input
                                        id="driverName"
                                        placeholder="Nom du chauffeur"
                                        value={driverName}
                                        onChange={e => setDriverName(e.target.value)}
                                        disabled={isLoading}
                                        aria-invalid={!!fieldErrors.driverName}
                                    />
                                    {fieldErrors.driverName ? (
                                        <p className="text-xs text-destructive">{fieldErrors.driverName}</p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">Prérempli avec le chauffeur habituel du véhicule.</p>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Véhicule et dépôt</CardTitle>
                            <CardDescription>Optionnels : véhicule utilisé et dépôt de départ des marchandises.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Véhicule</Label>
                                    {loadingData ? (
                                        <div className="h-9 animate-pulse rounded-lg border border-input bg-muted" aria-hidden="true" />
                                    ) : vehicles.length === 0 ? (
                                        <p className="py-2 text-sm text-muted-foreground">
                                            {loadError ? 'Liste indisponible' : 'Aucun véhicule enregistré'}
                                        </p>
                                    ) : (
                                        <Select value={vehicleId} onValueChange={setVehicleId}>
                                            <SelectTrigger className="w-full" aria-label="Véhicule">
                                                <Truck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                                <SelectValue placeholder="Sélectionner un véhicule" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {vehicles.map(v => (
                                                    <SelectItem key={v.id} value={v.id}>
                                                        {v.plate_number}{v.name ? ` — ${v.name}` : ''}{v.driver_name ? ` (${v.driver_name})` : ''}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label>Dépôt source</Label>
                                    {loadingData ? (
                                        <div className="h-9 animate-pulse rounded-lg border border-input bg-muted" aria-hidden="true" />
                                    ) : depots.length === 0 ? (
                                        <p className="py-2 text-sm text-muted-foreground">
                                            {loadError ? 'Liste indisponible' : 'Aucun dépôt enregistré'}
                                        </p>
                                    ) : (
                                        <Select value={depotId} onValueChange={setDepotId}>
                                            <SelectTrigger className="w-full" aria-label="Dépôt source">
                                                <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                                <SelectValue placeholder="Sélectionner un dépôt" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {depots.map(d => (
                                                    <SelectItem key={d.id} value={d.id}>
                                                        {d.name}{d.is_main ? ' (Principal)' : ''}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="notes">Notes</Label>
                                <Textarea
                                    id="notes"
                                    placeholder="Instructions particulières…"
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    rows={3}
                                    disabled={isLoading}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" asChild disabled={isLoading}>
                            <Link href="/dashboard/deliveries">Annuler</Link>
                        </Button>
                        <Button type="submit" variant="brand" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                    Création…
                                </>
                            ) : (
                                'Planifier la tournée'
                            )}
                        </Button>
                    </div>
                </form>
            </PageShell>
        </div>
    )
}
