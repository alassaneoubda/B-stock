'use client'

import { useState, useEffect } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ErrorState, TableSkeleton } from '@/components/states'
import { apiFetch, errorMessage, toastWarnings } from '@/lib/api-client'

const supplierSchema = z.object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
    type: z.enum(['manufacturer', 'distributor', 'wholesaler']).optional(),
    contactName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email('Adresse e-mail invalide').optional().or(z.literal('')),
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
    const [loadError, setLoadError] = useState<string | null>(null)
    const [reloadKey, setReloadKey] = useState(0)

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
            setIsFetching(true)
            setLoadError(null)
            try {
                const result = await apiFetch<{ data: any }>(`/api/suppliers/${supplierId}`)
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
            } catch (e) {
                setLoadError(errorMessage(e))
            } finally {
                setIsFetching(false)
            }
        }
        fetchSupplier()
    }, [supplierId, reset, reloadKey])

    async function onSubmit(data: SupplierForm) {
        setIsLoading(true)
        setError(null)
        try {
            const result = await apiFetch<{ warnings?: unknown }>(`/api/suppliers/${supplierId}`, {
                method: 'PATCH',
                body: data,
            })
            toast.success('Fournisseur mis à jour')
            toastWarnings(result?.warnings)
            router.push(`/dashboard/suppliers/${supplierId}`)
            router.refresh()
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setIsLoading(false)
        }
    }

    const backLink = (
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
            <Link href={`/dashboard/suppliers/${supplierId}`}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Fiche fournisseur
            </Link>
        </Button>
    )

    if (isFetching) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Modifier le fournisseur" description="Chargement…" />
                <PageShell>
                    <div className="mx-auto w-full max-w-3xl space-y-6">
                        {backLink}
                        <TableSkeleton rows={6} columns={2} />
                    </div>
                </PageShell>
            </div>
        )
    }

    if (loadError) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Modifier le fournisseur" />
                <PageShell>
                    <div className="mx-auto w-full max-w-3xl space-y-6">
                        {backLink}
                        <ErrorState
                            title="Impossible de charger le fournisseur"
                            description={loadError}
                            onRetry={() => setReloadKey((k) => k + 1)}
                        />
                    </div>
                </PageShell>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader title="Modifier le fournisseur" description="Mettre à jour les informations du fournisseur" />
            <PageShell>
                <form onSubmit={handleSubmit(onSubmit)} className="mx-auto w-full max-w-3xl space-y-6">
                    {backLink}

                    {error && (
                        <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Identité</CardTitle>
                            <CardDescription>Nom du fournisseur, type et personne à contacter.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="name">Nom ou raison sociale *</Label>
                                <Input id="name" {...register('name')} disabled={isLoading} aria-invalid={!!errors.name} />
                                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="type">Type de fournisseur</Label>
                                <Select
                                    onValueChange={(value) => setValue('type', value as SupplierForm['type'])}
                                    value={currentType}
                                    disabled={isLoading}
                                >
                                    <SelectTrigger id="type" className="w-full">
                                        <SelectValue placeholder="Sélectionner un type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {supplierTypes.map((t) => (
                                            <SelectItem key={t.value} value={t.value}>
                                                {t.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="contactName">Nom du contact</Label>
                                <Input id="contactName" {...register('contactName')} disabled={isLoading} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Coordonnées</CardTitle>
                            <CardDescription>Pour joindre le fournisseur et préparer vos commandes.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="phone">Téléphone</Label>
                                <Input id="phone" type="tel" {...register('phone')} disabled={isLoading} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">E-mail</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    {...register('email')}
                                    disabled={isLoading}
                                    aria-invalid={!!errors.email}
                                />
                                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="address">Adresse</Label>
                                <Input id="address" {...register('address')} disabled={isLoading} />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="notes">Notes</Label>
                                <Textarea id="notes" {...register('notes')} disabled={isLoading} />
                                <p className="text-xs text-muted-foreground">Visible uniquement par votre équipe.</p>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" asChild disabled={isLoading}>
                            <Link href="/dashboard/suppliers">Annuler</Link>
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                            {isLoading ? 'Enregistrement…' : 'Enregistrer'}
                        </Button>
                    </div>
                </form>
            </PageShell>
        </div>
    )
}
