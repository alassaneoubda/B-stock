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
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch, errorMessage } from '@/lib/api-client'

const depotSchema = z.object({
    name: z.string().min(1, 'Le nom est requis'),
    address: z.string().optional(),
    phone: z.string().optional(),
    isMain: z.boolean().default(false),
})

type DepotForm = z.infer<typeof depotSchema>

export default function NewDepotPage() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors },
    } = useForm<DepotForm>({
        resolver: zodResolver(depotSchema),
        defaultValues: {
            isMain: false,
        }
    })

    const isMain = watch('isMain')

    async function onSubmit(data: DepotForm) {
        setIsLoading(true)
        setError(null)

        try {
            await apiFetch('/api/depots', { method: 'POST', body: data })
            toast.success('Dépôt créé')
            router.push('/dashboard/depots')
            router.refresh()
        } catch (e) {
            // Erreur affichée dans le formulaire (message du serveur)
            setError(errorMessage(e))
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader title="Nouveau dépôt" description="Ajouter un entrepôt ou un point de stockage" />
            <PageShell>
                <form onSubmit={handleSubmit(onSubmit)} className="mx-auto w-full max-w-3xl space-y-6">
                    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
                        <Link href="/dashboard/depots">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Dépôts
                        </Link>
                    </Button>

                    {error && (
                        <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Informations du dépôt</CardTitle>
                            <CardDescription>Nom et coordonnées de l&apos;entrepôt.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nom du dépôt *</Label>
                                <Input
                                    id="name"
                                    placeholder="Ex. : Entrepôt Yopougon"
                                    {...register('name')}
                                    disabled={isLoading}
                                    aria-invalid={!!errors.name}
                                />
                                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                            </div>

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
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Statut</CardTitle>
                            <CardDescription>Le dépôt principal est utilisé par défaut pour vos opérations.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                                <div className="space-y-0.5">
                                    <Label htmlFor="isMain">Dépôt principal</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Définir ce dépôt comme votre lieu de stockage principal.
                                    </p>
                                </div>
                                <Switch
                                    id="isMain"
                                    checked={isMain}
                                    onCheckedChange={(checked) => setValue('isMain', checked)}
                                    disabled={isLoading}
                                />
                            </div>
                            {isMain && (
                                <div className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
                                    L&apos;actuel dépôt principal perdra ce statut.
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" asChild disabled={isLoading}>
                            <Link href="/dashboard/depots">Annuler</Link>
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                            {isLoading ? 'Création…' : 'Créer le dépôt'}
                        </Button>
                    </div>
                </form>
            </PageShell>
        </div>
    )
}
