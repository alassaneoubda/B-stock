'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const clientSchema = z.object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
    contactName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email('Email invalide').optional().or(z.literal('')),
    address: z.string().optional(),
    zone: z.string().optional(),
    clientType: z.string().min(1, 'Le type de client est requis'),
    creditLimit: z.number().min(0, 'La limite de crédit doit être positive'),
    packagingCreditLimit: z.number().min(0, 'La limite emballage doit être positive'),
    paymentTermsDays: z.number().min(0).max(90),
    notes: z.string().optional(),
    isActive: z.boolean().default(true),
})

type ClientForm = z.infer<typeof clientSchema>

const clientTypes = [
    { value: 'retail', label: 'Détaillant' },
    { value: 'wholesale', label: 'Grossiste' },
    { value: 'restaurant', label: 'Restaurant' },
    { value: 'bar', label: 'Bar / Maquis' },
    { value: 'subdepot', label: 'Sous-dépôt' },
]

const zones = [
    'Zone 1 - Centre',
    'Zone 2 - Nord',
    'Zone 3 - Sud',
    'Zone 4 - Est',
    'Zone 5 - Ouest',
]

export default function EditClientPage() {
    const router = useRouter()
    const params = useParams()
    const clientId = params.id as string

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
    } = useForm<ClientForm>({
        resolver: zodResolver(clientSchema),
        defaultValues: {
            isActive: true,
            creditLimit: 0,
            packagingCreditLimit: 0,
            paymentTermsDays: 0,
        },
    })

    const isActive = watch('isActive')
    const currentClientType = watch('clientType')
    const currentZone = watch('zone')

    useEffect(() => {
        async function fetchClient() {
            try {
                const res = await fetch(`/api/clients/${clientId}`)
                const result = await res.json()
                if (!res.ok || !result.data) {
                    setError('Client introuvable')
                    return
                }
                const c = result.data
                reset({
                    name: c.name || '',
                    contactName: c.contact_name || '',
                    phone: c.phone || '',
                    email: c.email || '',
                    address: c.address || '',
                    zone: c.zone || '',
                    clientType: c.client_type || 'retail',
                    creditLimit: Number(c.credit_limit) || 0,
                    packagingCreditLimit: Number(c.packaging_credit_limit) || 0,
                    paymentTermsDays: Number(c.payment_terms_days) || 0,
                    notes: c.notes || '',
                    isActive: c.is_active !== false,
                })
            } catch {
                setError('Erreur lors du chargement du client')
            } finally {
                setIsFetching(false)
            }
        }
        fetchClient()
    }, [clientId, reset])

    async function onSubmit(data: ClientForm) {
        setIsLoading(true)
        setError(null)

        try {
            const response = await fetch(`/api/clients/${clientId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            })

            const result = await response.json()

            if (!response.ok) {
                setError(result.error || 'Une erreur est survenue')
                return
            }

            router.push(`/dashboard/clients/${clientId}`)
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
                <DashboardHeader title="Modifier le client" description="Chargement..." />
                <main className="flex-1 p-4 lg:p-6 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </main>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader
                title="Modifier le client"
                description="Mettez à jour les informations du client"
            />

            <main className="flex-1 p-4 lg:p-6">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href={`/dashboard/clients/${clientId}`}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Retour à la fiche client
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
                            <CardTitle>Informations générales</CardTitle>
                            <CardDescription>Les informations de base du client</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nom du client / Entreprise *</Label>
                                    <Input
                                        id="name"
                                        placeholder="Ex: Boutique Koffi"
                                        {...register('name')}
                                        disabled={isLoading}
                                    />
                                    {errors.name && (
                                        <p className="text-sm text-destructive">{errors.name.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="clientType">Type de client *</Label>
                                    <Select
                                        value={currentClientType}
                                        onValueChange={(value) => setValue('clientType', value)}
                                        disabled={isLoading}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Sélectionner un type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {clientTypes.map((type) => (
                                                <SelectItem key={type.value} value={type.value}>
                                                    {type.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.clientType && (
                                        <p className="text-sm text-destructive">{errors.clientType.message}</p>
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="contactName">Nom du contact</Label>
                                    <Input
                                        id="contactName"
                                        placeholder="Ex: Jean Koffi"
                                        {...register('contactName')}
                                        disabled={isLoading}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="phone">Téléphone</Label>
                                    <Input
                                        id="phone"
                                        type="tel"
                                        placeholder="+225 XX XX XX XX XX"
                                        {...register('phone')}
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="client@exemple.com"
                                    {...register('email')}
                                    disabled={isLoading}
                                />
                                {errors.email && (
                                    <p className="text-sm text-destructive">{errors.email.message}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="address">Adresse</Label>
                                <Textarea
                                    id="address"
                                    placeholder="Adresse complète du client"
                                    {...register('address')}
                                    disabled={isLoading}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="zone">Zone de livraison</Label>
                                <Select
                                    value={currentZone}
                                    onValueChange={(value) => setValue('zone', value)}
                                    disabled={isLoading}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Sélectionner une zone" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {zones.map((zone) => (
                                            <SelectItem key={zone} value={zone}>
                                                {zone}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="notes">Notes</Label>
                                <Textarea
                                    id="notes"
                                    placeholder="Notes internes sur ce client"
                                    {...register('notes')}
                                    disabled={isLoading}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Conditions commerciales</CardTitle>
                            <CardDescription>
                                Définissez les conditions de crédit et de paiement
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="creditLimit">Limite de crédit produits (FCFA)</Label>
                                    <Input
                                        id="creditLimit"
                                        type="number"
                                        min="0"
                                        placeholder="0"
                                        {...register('creditLimit', { valueAsNumber: true })}
                                        disabled={isLoading}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        0 = pas de crédit produit autorisé
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="packagingCreditLimit">Limite de crédit emballages (FCFA)</Label>
                                    <Input
                                        id="packagingCreditLimit"
                                        type="number"
                                        min="0"
                                        placeholder="0"
                                        {...register('packagingCreditLimit', { valueAsNumber: true })}
                                        disabled={isLoading}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        0 = pas de crédit emballage autorisé
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="paymentTermsDays">Délai de paiement (jours)</Label>
                                    <Input
                                        id="paymentTermsDays"
                                        type="number"
                                        min="0"
                                        max="90"
                                        placeholder="0"
                                        {...register('paymentTermsDays', { valueAsNumber: true })}
                                        disabled={isLoading}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        0 = paiement immédiat
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Statut</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label htmlFor="isActive">Client actif</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Les clients inactifs ne peuvent pas passer de commandes
                                    </p>
                                </div>
                                <Switch
                                    id="isActive"
                                    checked={isActive}
                                    onCheckedChange={(checked) => setValue('isActive', checked)}
                                    disabled={isLoading}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-4">
                        <Button type="button" variant="outline" asChild disabled={isLoading}>
                            <Link href={`/dashboard/clients/${clientId}`}>Annuler</Link>
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Enregistrement...
                                </>
                            ) : (
                                'Enregistrer les modifications'
                            )}
                        </Button>
                    </div>
                </form>
            </main>
        </div>
    )
}
