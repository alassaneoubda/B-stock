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
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

const packagingSchema = z.object({
    name: z.string().min(1, 'Le nom est requis'),
    unitsPerCase: z.number().int().min(1, 'Doit être au moins 1').default(1),
    isReturnable: z.boolean().default(true),
    depositPrice: z.number().min(0, 'Le prix doit être positif').default(0),
})

type PackagingForm = z.infer<typeof packagingSchema>

export default function NewPackagingPage() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors },
    } = useForm<PackagingForm>({
        resolver: zodResolver(packagingSchema),
        defaultValues: {
            unitsPerCase: 1,
            isReturnable: true,
            depositPrice: 0,
        }
    })

    const isReturnable = watch('isReturnable')

    async function onSubmit(data: PackagingForm) {
        setIsLoading(true)
        setError(null)

        try {
            const response = await fetch('/api/packaging', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            })

            const result = await response.json()

            if (!response.ok) {
                setError(result.error || 'Une erreur est survenue')
                return
            }

            router.push('/dashboard/packaging')
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
                title="Ajouter un type d'emballage"
                description="Créer un nouveau type d'emballage"
            />
            <main className="flex-1 p-4 lg:p-6 ">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/packaging">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Retour
                        </Link>
                    </Button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="max-w-xl space-y-6">
                    {error && (
                        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <Card className="rounded-lg border-slate-200/60 shadow-sm overflow-hidden">
                        <CardHeader className="px-8 py-8 border-b border-slate-100">
                            <CardTitle className="text-xl font-semibold text-slate-950">Nouvel emballage</CardTitle>
                            <CardDescription>Définissez les caractéristiques du contenant.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nom de l'emballage *</Label>
                                <Input
                                    id="name"
                                    placeholder="Ex: Casier 24 Bouteilles"
                                    {...register('name')}
                                    disabled={isLoading}
                                />
                                {errors.name && (
                                    <p className="text-sm text-destructive">{errors.name.message}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="unitsPerCase">Nombre d'unités par emballage *</Label>
                                <Input
                                    id="unitsPerCase"
                                    type="number"
                                    min="1"
                                    placeholder="Ex: 24"
                                    {...register('unitsPerCase', { valueAsNumber: true })}
                                    disabled={isLoading}
                                />
                                <p className="text-sm text-muted-foreground">
                                    Combien de bouteilles/canettes contient cet emballage ?
                                </p>
                                {errors.unitsPerCase && (
                                    <p className="text-sm text-destructive">{errors.unitsPerCase.message}</p>
                                )}
                            </div>

                            <div className="space-y-4 pt-2">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label htmlFor="isReturnable" className="text-base">Consignable</Label>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Les clients doivent-ils retourner cet emballage ?
                                        </p>
                                    </div>
                                    <Switch
                                        id="isReturnable"
                                        checked={isReturnable}
                                        onCheckedChange={(checked) => setValue('isReturnable', checked)}
                                        disabled={isLoading}
                                    />
                                </div>

                                {isReturnable && (
                                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <Label htmlFor="depositPrice">Prix de la consigne (FCFA) *</Label>
                                        <Input
                                            id="depositPrice"
                                            type="number"
                                            min="0"
                                            placeholder="Ex: 1500"
                                            {...register('depositPrice', { valueAsNumber: true })}
                                            disabled={isLoading}
                                        />
                                        <p className="text-sm text-muted-foreground">
                                            Le montant facturé si le client ne rend pas l'emballage.
                                        </p>
                                        {errors.depositPrice && (
                                            <p className="text-sm text-destructive">{errors.depositPrice.message}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-4">
                        <Button type="button" variant="outline" asChild disabled={isLoading}>
                            <Link href="/dashboard/packaging">Annuler</Link>
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Création...
                                </>
                            ) : (
                                'Créer'
                            )}
                        </Button>
                    </div>
                </form>
            </main>
        </div>
    )
}
