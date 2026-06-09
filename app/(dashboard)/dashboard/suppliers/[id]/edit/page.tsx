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
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

const supplierSchema = z.object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
    type: z.enum(['manufacturer', 'distributor', 'wholesaler']).optional(),
    contactName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email('Email invalide').optional().or(z.literal('')),
    address: z.string().optional(),
    notes: z.string().optional(),
})

type SupplierForm = z.infer<typeof supplierSchema>

const supplierTypes = [
    { value: 'manufacturer', label: 'Fabricant' },
    { value: 'distributor', label: 'Distributeur' },
    { value: 'wholesaler', label: 'Grossiste' },
]

export default function EditSupplierPage() {
    const router = useRouter()
    const params = useParams()
    const supplierId = params.id as string

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
    } = useForm<SupplierForm>({
        resolver: zodResolver(supplierSchema),
    })

    const currentType = watch('type')

    useEffect(() => {
        async function fetchSupplier() {
            try {
                const res = await fetch(`/api/suppliers/${supplierId}`)
                const result = await res.json()
                if (!res.ok || !result.data) {
                    setError('Fournisseur introuvable')
                    return
                }
                const s = result.data
                reset({
                    name: s.name || '',
                    type: s.type || undefined,
                    contactName: s.contact_name || '',
                    phone: s.phone || '',
                    email: s.email || '',
                    address: s.address || '',
                    notes: s.notes || '',
                })
            } catch {
                setError('Erreur lors du chargement')
            } finally {
                setIsFetching(false)
            }
        }
        fetchSupplier()
    }, [supplierId, reset])

    async function onSubmit(data: SupplierForm) {
        setIsLoading(true)
        setError(null)
        try {
            const response = await fetch(`/api/suppliers/${supplierId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            })
            const result = await response.json()
            if (!response.ok) {
                setError(result.error || 'Une erreur est survenue')
                return
            }
            router.push(`/dashboard/suppliers/${supplierId}`)
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
                <DashboardHeader title="Modifier le fournisseur" description="Chargement..." />
                <main className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </main>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader title="Modifier le fournisseur" description="Mettre à jour les informations" />
            <main className="flex-1 p-4 lg:p-6">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/suppliers">
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
                            <CardTitle>Informations fournisseur</CardTitle>
                            <CardDescription>Coordonnées et type de fournisseur</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nom *</Label>
                                    <Input id="name" {...register('name')} disabled={isLoading} />
                                    {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="type">Type</Label>
                                    <Select
                                        onValueChange={(value) => setValue('type', value as SupplierForm['type'])}
                                        value={currentType}
                                        disabled={isLoading}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Sélectionner un type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {supplierTypes.map((t) => (
                                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="contactName">Personne de contact</Label>
                                    <Input id="contactName" {...register('contactName')} disabled={isLoading} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Téléphone</Label>
                                    <Input id="phone" {...register('phone')} disabled={isLoading} />
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input id="email" type="email" {...register('email')} disabled={isLoading} />
                                    {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="address">Adresse</Label>
                                    <Input id="address" {...register('address')} disabled={isLoading} />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="notes">Notes</Label>
                                <Textarea id="notes" {...register('notes')} disabled={isLoading} />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-4">
                        <Button type="button" variant="outline" asChild disabled={isLoading}>
                            <Link href="/dashboard/suppliers">Annuler</Link>
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
