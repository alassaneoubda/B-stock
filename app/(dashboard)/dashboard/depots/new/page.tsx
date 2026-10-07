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
        <div className="flex flex-col min-h-screen">
            <DashboardHeader
                title="Ajouter un dépôt"
                description="Créer un nouveau dépôt"
            />
            <main className="flex-1 p-4 lg:p-6 ">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/depots">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Retour
                        </Link>
                    </Button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
                    {error && (
                        <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <Card className="rounded-lg border-border shadow-sm overflow-hidden">
                        <CardHeader className="px-8 py-8 border-b border-border">
                            <CardTitle className="text-xl font-semibold text-foreground">Nouveau dépôt</CardTitle>
                            <CardDescription>Informations générales de l'entrepôt</CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 space-y-6">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nom du dépôt *</Label>
                                    <Input
                                        id="name"
                                        placeholder="Ex: Entrepôt Principal Yopougon"
                                        {...register('name')}
                                        disabled={isLoading}
                                    />
                                    {errors.name && (
                                        <p className="text-sm text-destructive">{errors.name.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="phone">Téléphone</Label>
                                    <Input
                                        id="phone"
                                        placeholder="+225 0102030405"
                                        {...register('phone')}
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="address">Adresse</Label>
                                <Textarea
                                    id="address"
                                    placeholder="Adresse complète du dépôt"
                                    {...register('address')}
                                    disabled={isLoading}
                                />
                            </div>

                            <div className="space-y-4 pt-4 border-t border-border">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label htmlFor="isMain" className="text-base text-foreground font-bold">Dépôt principal</Label>
                                        <p className="text-sm text-muted-foreground mt-1">
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
                                    <div className="rounded-lg bg-warning-soft border border-warning/30 p-4 text-sm text-warning-foreground animate-in fade-in slide-in-from-top-2">
                                        Attention : En définissant ce dépôt comme principal, l'ancien dépôt principal perdra ce statut.
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-4">
                        <Button type="button" variant="outline" asChild disabled={isLoading}>
                            <Link href="/dashboard/depots">Annuler</Link>
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Création...
                                </>
                            ) : (
                                'Créer le dépôt'
                            )}
                        </Button>
                    </div>
                </form>
            </main>
        </div>
    )
}
