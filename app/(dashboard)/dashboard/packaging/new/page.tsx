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
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch, errorMessage, toastWarnings } from '@/lib/api-client'

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
            const result = await apiFetch<{ warnings?: unknown }>('/api/packaging', {
                method: 'POST',
                body: data,
            })

            toast.success('Emballage créé')
            toastWarnings(result?.warnings)
            router.push('/dashboard/packaging')
            router.refresh()
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Nouvel emballage"
                description="Créer un format de conditionnement"
            />
            <PageShell>
                <div className="mx-auto w-full max-w-3xl space-y-6">
                    <Button variant="ghost" size="sm" asChild className="-ml-2">
                        <Link href="/dashboard/packaging">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            Emballages
                        </Link>
                    </Button>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        {error && (
                            <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                {error}
                            </div>
                        )}

                        <Card>
                            <CardHeader>
                                <CardTitle>Caractéristiques</CardTitle>
                                <CardDescription>Nom du contenant et nombre d&apos;unités qu&apos;il contient.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nom de l&apos;emballage *</Label>
                                    <Input
                                        id="name"
                                        placeholder="Ex. : Casier 24 bouteilles"
                                        {...register('name')}
                                        disabled={isLoading}
                                    />
                                    {errors.name && (
                                        <p className="text-xs text-destructive">{errors.name.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="unitsPerCase">Unités par emballage *</Label>
                                    <Input
                                        id="unitsPerCase"
                                        type="number"
                                        min="1"
                                        placeholder="Ex. : 24"
                                        className="tabular"
                                        {...register('unitsPerCase', { valueAsNumber: true })}
                                        disabled={isLoading}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Nombre de bouteilles ou canettes contenues.
                                    </p>
                                    {errors.unitsPerCase && (
                                        <p className="text-xs text-destructive">{errors.unitsPerCase.message}</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Consigne</CardTitle>
                                <CardDescription>Suivi des emballages à retourner par les clients.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="isReturnable">Emballage consigné</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Les clients doivent rendre cet emballage.
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
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="depositPrice">Montant de la consigne (FCFA) *</Label>
                                            <Input
                                                id="depositPrice"
                                                type="number"
                                                min="0"
                                                placeholder="Ex. : 1500"
                                                className="tabular"
                                                {...register('depositPrice', { valueAsNumber: true })}
                                                disabled={isLoading}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Facturé si le client ne rend pas l&apos;emballage.
                                            </p>
                                            {errors.depositPrice && (
                                                <p className="text-xs text-destructive">{errors.depositPrice.message}</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" asChild disabled={isLoading}>
                                <Link href="/dashboard/packaging">Annuler</Link>
                            </Button>
                            <Button type="submit" disabled={isLoading}>
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                        Création…
                                    </>
                                ) : (
                                    'Créer l’emballage'
                                )}
                            </Button>
                        </div>
                    </form>
                </div>
            </PageShell>
        </div>
    )
}
