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
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch, errorMessage, toastWarnings } from '@/lib/api-client'

const supplierSchema = z.object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
    type: z.enum(['manufacturer', 'distributor', 'wholesaler']).optional(),
    contactName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email('Adresse e-mail invalide').optional().or(z.literal('')),
    address: z.string().optional(),
    notes: z.string().optional(),
    paymentTermsDays: z
        .string()
        .regex(/^\d{0,3}$/, 'Nombre de jours invalide')
        .refine((v) => !v || Number(v) <= 365, 'Au maximum 365 jours')
        .optional(),
})

type SupplierForm = z.infer<typeof supplierSchema>

const supplierTypes = [
    { value: 'manufacturer', label: 'Fabricant' },
    { value: 'distributor', label: 'Distributeur' },
    { value: 'wholesaler', label: 'Grossiste' },
]

export default function NewSupplierPage() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors },
    } = useForm<SupplierForm>({
        resolver: zodResolver(supplierSchema),
        defaultValues: {
            type: 'distributor'
        }
    })

    async function onSubmit(data: SupplierForm) {
        setIsLoading(true)
        setError(null)

        try {
            const result = await apiFetch<{ warnings?: unknown }>('/api/suppliers', {
                method: 'POST',
                body: { ...data, paymentTermsDays: data.paymentTermsDays ? Number(data.paymentTermsDays) : 0 },
            })

            toast.success('Fournisseur créé')
            toastWarnings(result?.warnings)
            router.push('/dashboard/suppliers')
            router.refresh()
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader title="Nouveau fournisseur" description="Ajouter une brasserie, un distributeur ou un grossiste" />
            <PageShell>
                <form onSubmit={handleSubmit(onSubmit)} className="mx-auto w-full max-w-3xl space-y-6">
                    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
                        <Link href="/dashboard/suppliers">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Fournisseurs
                        </Link>
                    </Button>

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
                                <Input
                                    id="name"
                                    placeholder="Ex. : Solibra"
                                    {...register('name')}
                                    disabled={isLoading}
                                    aria-invalid={!!errors.name}
                                />
                                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="type">Type de fournisseur</Label>
                                <Select
                                    onValueChange={(value) => setValue('type', value as any)}
                                    defaultValue="distributor"
                                    disabled={isLoading}
                                >
                                    <SelectTrigger id="type" className="w-full">
                                        <SelectValue placeholder="Sélectionner un type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {supplierTypes.map((type) => (
                                            <SelectItem key={type.value} value={type.value}>
                                                {type.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="contactName">Nom du contact</Label>
                                <Input
                                    id="contactName"
                                    placeholder="Ex. : Jean Kouassi"
                                    {...register('contactName')}
                                    disabled={isLoading}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="paymentTermsDays">Conditions de paiement (jours)</Label>
                                <Input
                                    id="paymentTermsDays"
                                    type="number"
                                    min={0}
                                    max={365}
                                    inputMode="numeric"
                                    placeholder="0 = comptant, ex. 30"
                                    {...register('paymentTermsDays')}
                                    disabled={isLoading}
                                    aria-invalid={!!errors.paymentTermsDays}
                                />
                                {errors.paymentTermsDays ? (
                                    <p className="text-xs text-destructive">{errors.paymentTermsDays.message}</p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">Délai accordé après réception : sert au calcul des échéances.</p>
                                )}
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
                                <Input
                                    id="phone"
                                    type="tel"
                                    placeholder="+225 01 02 03 04 05"
                                    {...register('phone')}
                                    disabled={isLoading}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email">E-mail</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="contact@exemple.com"
                                    {...register('email')}
                                    disabled={isLoading}
                                    aria-invalid={!!errors.email}
                                />
                                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                            </div>

                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="address">Adresse</Label>
                                <Textarea
                                    id="address"
                                    placeholder="Commune, quartier, repère…"
                                    rows={2}
                                    {...register('address')}
                                    disabled={isLoading}
                                />
                            </div>

                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="notes">Notes</Label>
                                <Textarea
                                    id="notes"
                                    placeholder="Conditions de paiement, jours de livraison…"
                                    {...register('notes')}
                                    disabled={isLoading}
                                />
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
                            {isLoading ? 'Création…' : 'Créer le fournisseur'}
                        </Button>
                    </div>
                </form>
            </PageShell>
        </div>
    )
}
