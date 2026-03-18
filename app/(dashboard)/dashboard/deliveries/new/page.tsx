'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
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
import { ArrowLeft, Loader2, Truck, MapPin } from 'lucide-react'
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

    // Form state
    const [tourDate, setTourDate] = useState(new Date().toISOString().split('T')[0])
    const [driverName, setDriverName] = useState('')
    const [vehicleId, setVehicleId] = useState<string>('')
    const [depotId, setDepotId] = useState<string>('')
    const [notes, setNotes] = useState('')

    // Validation
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

    useEffect(() => {
        async function fetchData() {
            try {
                const [vehiclesRes, depotsRes] = await Promise.all([
                    fetch('/api/vehicles'),
                    fetch('/api/depots'),
                ])
                const vehiclesData = await vehiclesRes.json()
                const depotsData = await depotsRes.json()

                setVehicles(vehiclesData.data || [])
                setDepots(depotsData.depots || [])
            } catch (err) {
                console.error('Error loading form data:', err)
            } finally {
                setLoadingData(false)
            }
        }
        fetchData()
    }, [])

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
            const response = await fetch('/api/deliveries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tourDate,
                    driverName: driverName.trim(),
                    vehicleId: vehicleId || null,
                    depotId: depotId || null,
                    notes: notes.trim() || undefined,
                }),
            })

            const result = await response.json()

            if (!response.ok) {
                setError(result.error || 'Une erreur est survenue')
                return
            }

            router.push('/dashboard/deliveries')
            router.refresh()
        } catch {
            setError('Une erreur réseau est survenue.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader
                title="Planifier une tournée"
                description="Créer une nouvelle tournée de livraison"
            />
            <main className="flex-1 p-4 lg:p-6 ">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/deliveries">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Retour
                        </Link>
                    </Button>
                </div>

                <form onSubmit={onSubmit} className="max-w-2xl space-y-6">
                    {error && (
                        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Nouvelle tournée de livraison</CardTitle>
                            <CardDescription>Renseignez les détails de la tournée</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="tourDate">Date de la tournée *</Label>
                                    <Input
                                        id="tourDate"
                                        type="date"
                                        value={tourDate}
                                        onChange={e => setTourDate(e.target.value)}
                                        disabled={isLoading}
                                    />
                                    {fieldErrors.tourDate && (
                                        <p className="text-sm text-destructive">{fieldErrors.tourDate}</p>
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
                                    />
                                    {fieldErrors.driverName && (
                                        <p className="text-sm text-destructive">{fieldErrors.driverName}</p>
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Véhicule</Label>
                                    {loadingData ? (
                                        <div className="h-9 rounded-md border border-input bg-muted animate-pulse" />
                                    ) : vehicles.length === 0 ? (
                                        <p className="text-sm text-muted-foreground py-2">Aucun véhicule enregistré</p>
                                    ) : (
                                        <Select value={vehicleId} onValueChange={setVehicleId}>
                                            <SelectTrigger className="w-full">
                                                <Truck className="h-4 w-4 text-muted-foreground" />
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
                                        <div className="h-9 rounded-md border border-input bg-muted animate-pulse" />
                                    ) : depots.length === 0 ? (
                                        <p className="text-sm text-muted-foreground py-2">Aucun dépôt enregistré</p>
                                    ) : (
                                        <Select value={depotId} onValueChange={setDepotId}>
                                            <SelectTrigger className="w-full">
                                                <MapPin className="h-4 w-4 text-muted-foreground" />
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
                                    placeholder="Instructions particulières..."
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    rows={3}
                                    disabled={isLoading}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-3">
                        <Button type="button" variant="outline" asChild disabled={isLoading}>
                            <Link href="/dashboard/deliveries">Annuler</Link>
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Création...
                                </>
                            ) : (
                                'Planifier la tournée'
                            )}
                        </Button>
                    </div>
                </form>
            </main>
        </div>
    )
}
